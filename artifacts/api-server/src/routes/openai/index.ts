import { Router } from "express";
import { db, pool, conversations, messages, type PoolClient } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { CreateOpenaiConversationBody, SendOpenaiMessageBody } from "@workspace/api-zod";
import { session, rateLimit } from "../../middlewares/session";
import { generateGuide, attachPassageText, hasAIConfiguration, AIProviderError } from "../../lib/bible-guide";

const router = Router();
router.use(session);
const activeConversations = new Set<number>();
const createBody = CreateOpenaiConversationBody.extend({ title: CreateOpenaiConversationBody.shape.title.trim().min(1).max(120) });
const messageBody = SendOpenaiMessageBody.extend({ content: SendOpenaiMessageBody.shape.content.trim().min(1).max(4000) });
const fields = { id: conversations.id, title: conversations.title, createdAt: conversations.createdAt };

function conversationId(value: string | string[]): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function ownership(id: number, sessionId: string) {
  return and(eq(conversations.id, id), eq(conversations.sessionId, sessionId));
}

router.get("/configuration", (_req, res) => {
  res.json({ aiConfigured: hasAIConfiguration(), provider: "gemini", translation: "NVI", passageTextConfigured: Boolean(process.env.BIBLE_API_KEY && process.env.BIBLE_ID_NVI) });
});

router.get("/conversations", async (_req, res) => {
  const rows = await db.select(fields).from(conversations).where(eq(conversations.sessionId, res.locals.sessionId)).orderBy(desc(conversations.id)).limit(100);
  res.json(rows);
});

router.post("/conversations", rateLimit(60, 3600000), async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid conversation title" }); return; }
  const [conv] = await db.insert(conversations).values({ title: parsed.data.title, sessionId: res.locals.sessionId }).returning(fields);
  res.status(201).json(conv);
});

router.get("/conversations/:id", async (req, res) => {
  const id = conversationId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.select(fields).from(conversations).where(ownership(id, res.locals.sessionId));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.id));
  res.json({ ...conv, messages: msgs });
});

router.delete("/conversations/:id", async (req, res) => {
  const id = conversationId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  if (activeConversations.has(id)) { res.status(409).json({ error: "Conversation is busy" }); return; }
  const removed = await db.delete(conversations).where(ownership(id, res.locals.sessionId)).returning({ id: conversations.id });
  if (!removed.length) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.status(204).end();
});

router.get("/conversations/:id/messages", async (req, res) => {
  const id = conversationId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.select({ id: conversations.id }).from(conversations).where(ownership(id, res.locals.sessionId));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.id));
  res.json(rows);
});

router.post("/conversations/:id/messages", rateLimit(20, 60000), async (req, res) => {
  const id = conversationId(req.params.id);
  const parsed = messageBody.safeParse(req.body);
  if (id === null || !parsed.success) { res.status(400).json({ error: "Invalid message (1-4000 characters)" }); return; }
  if (!hasAIConfiguration()) { res.status(503).json({ error: "AI_NOT_CONFIGURED" }); return; }
  const [conv] = await db.select({ id: conversations.id }).from(conversations).where(ownership(id, res.locals.sessionId));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  if (activeConversations.has(id)) { res.status(409).json({ error: "Conversation is busy" }); return; }
  if (activeConversations.size >= 8) { res.status(503).json({ error: "Server busy" }); return; }
  activeConversations.add(id);
  const abort = new AbortController();
  const close = () => abort.abort();
  res.once("close", close);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let client: PoolClient | undefined;
  let locked = false;
  try {
    client = await pool.connect();
    const lock = await client.query("SELECT pg_try_advisory_lock(772402, $1) AS acquired", [id]);
    locked = lock.rows[0].acquired;
    if (!locked) { res.status(409).json({ error: "Conversation is busy" }); return; }
    const history = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.id));
    // Keep every accepted message; never silently discard the person's context.
    if (history.length >= 100 || history.reduce((size, m) => size + m.content.length, parsed.data.content.length) > 120000) {
      res.status(413).json({ error: "CONVERSATION_LIMIT" }); return;
    }
    if (abort.signal.aborted) return;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    heartbeat = setInterval(() => { if (!res.destroyed) res.write(": keepalive\n\n"); }, 15000);
    const reply = await generateGuide([...history, { role: "user", content: parsed.data.content }], parsed.data.language ?? "es", abort.signal);
    const enriched = await attachPassageText(reply, abort.signal).catch((error) => {
      if (abort.signal.aborted) throw error;
      req.log.warn({ error: error instanceof Error ? error.name : "SourceError" }, "Using NVI reading link");
      return reply;
    });
    if (abort.signal.aborted) return;
    const content = JSON.stringify(enriched);
    await client.query("BEGIN");
    try {
      const owner = await client.query("SELECT id FROM conversations WHERE id=$1 AND session_id=$2 FOR UPDATE", [id, res.locals.sessionId]);
      if (!owner.rowCount) throw new Error("Conversation was removed");
      await client.query("INSERT INTO messages(conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)", [id, parsed.data.content, content]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      // Do not log provider payloads: they can contain the user's conversation.
      req.log.error({ error: error instanceof Error ? error.name : "UnknownError", status: error instanceof AIProviderError ? error.status : undefined }, "Bible recommendation failed");
      const code = error instanceof AIProviderError
        ? error.status === 429 ? "AI_QUOTA_LIMIT" : error.status === 404 ? "AI_MODEL_UNAVAILABLE" : [400, 401, 403].includes(error.status) ? "AI_ACCESS_DENIED" : "RECOMMENDATION_FAILED"
        : "RECOMMENDATION_FAILED";
      const retryAfter = error instanceof AIProviderError ? error.retryAfter : undefined;
      if (!res.headersSent) res.status(code === "AI_QUOTA_LIMIT" ? 429 : 502).json({ error: code, retryAfter });
      else { res.write(`data: ${JSON.stringify({ error: code, retryAfter })}\n\n`); res.end(); }
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    res.off("close", close);
    let unlockError: Error | undefined;
    if (locked && client) await client.query("SELECT pg_advisory_unlock(772402, $1)", [id]).catch((error: Error) => { unlockError = error; });
    client?.release(unlockError);
    activeConversations.delete(id);
  }
});

export default router;
