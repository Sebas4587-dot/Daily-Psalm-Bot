import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const { build } = require("esbuild");
async function load(relativePath) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const guide = await load("../lib/api-zod/src/guide.ts");
const stream = await load("../artifacts/psalm-chatbot/src/lib/chat-stream.ts");
const provider = await load("../artifacts/api-server/src/lib/bible-guide.ts");
const passage = { book: "MAT", chapter: 11, verseStart: 28, verseEnd: 30, summary: "Una invitación a descansar.", context: "Jesús invita a quienes llevan cargas.", reflection: "Puedes reconocer tu cansancio." };
const reply = { format: "bible-guide-v1", message: "Gracias por compartirlo.", recommendations: [passage] };

test("supports references from the entire canon, with NVI reading links", () => {
  assert.equal(guide.BIBLE_BOOKS.length, 66);
  for (const p of [passage, { ...passage, book: "GEN", chapter: 50, verseStart: 20, verseEnd: 20 }, { ...passage, book: "REV", chapter: 21, verseStart: 4, verseEnd: 4 }]) assert.ok(guide.RecommendationSchema.safeParse(p).success);
  const url = new URL(guide.passageUrl(passage));
  assert.equal(url.hostname, "www.biblegateway.com");
  assert.equal(url.searchParams.get("version"), "NVI");
  assert.equal(url.searchParams.get("search"), "Mateo 11:28-30");
});

test("rejects nonexistent books, chapters, verses, reversed ranges, and invented quotes", () => {
  for (const update of [{ book: "INVENTED" }, { chapter: 99 }, { verseEnd: 200 }, { verseStart: 30, verseEnd: 28 }, { quote: "Invented NVI text" }]) assert.equal(guide.RecommendationSchema.safeParse({ ...passage, ...update }).success, false);
});

function responseWithChunks(text, chunkSize = 1) {
  const data = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < data.length; i += chunkSize) controller.enqueue(data.slice(i, i + chunkSize)); controller.close(); } }));
}
test("reads fragmented SSE, multibyte Spanish, heartbeats, and CRLF", async () => {
  const text = `: keepalive\r\n\r\ndata: ${JSON.stringify({ content: "Corazón y esperanza" })}\r\n\r\ndata: {"done":true}\r\n\r\n`;
  let displayed = "";
  assert.equal(await stream.readChatStream(responseWithChunks(text), (value) => { displayed = value; }), "Corazón y esperanza");
  assert.equal(displayed, "Corazón y esperanza");
});
test("detects quota errors and truncated responses instead of reporting success", async () => {
  await assert.rejects(stream.readChatStream(responseWithChunks('data: {"error":"AI_QUOTA_LIMIT"}\n\n'), () => {}), { code: "AI_QUOTA_LIMIT" });
  await assert.rejects(stream.readChatStream(responseWithChunks('data: {"content":"partial"}\n\n'), () => {}), { code: "INCOMPLETE_RESPONSE" });
});

test("sends all conversation turns to Gemini with structured output and no paid fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "unit-test-key";
  process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
  const history = [{ role: "user", content: "Estoy cansado" }, { role: "assistant", content: "¿Qué ha pasado?" }, { role: "user", content: "Mi trabajo me preocupa" }];
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      ++calls;
      assert.equal(new URL(url).hostname, "generativelanguage.googleapis.com");
      assert.equal(options.headers["x-goog-api-key"], "unit-test-key");
      const request = JSON.parse(options.body);
      assert.deepEqual(request.contents.map((m) => m.parts[0].text), history.map((m) => m.content));
      assert.deepEqual(request.contents.map((m) => m.role), ["user", "model", "user"]);
      assert.equal(request.generationConfig.responseMimeType, "application/json");
      assert.match(request.systemInstruction.parts[0].text, /ALL 66 books/);
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(reply) }] } }] });
    };
    assert.deepEqual(await provider.generateGuide(history, "es", new AbortController().signal), reply);
    assert.equal(calls, 1);
    globalThis.fetch = async () => { ++calls; return Response.json({ error: "quota" }, { status: 429, headers: { "retry-after": "20" } }); };
    await assert.rejects(provider.generateGuide(history, "es", new AbortController().signal), (error) => error.status === 429 && error.retryAfter === 20);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel;
  }
});

test("does not fabricate passage text when no licensed NVI source is configured", async () => {
  const key = process.env.BIBLE_API_KEY;
  const id = process.env.BIBLE_ID_NVI;
  delete process.env.BIBLE_API_KEY;
  delete process.env.BIBLE_ID_NVI;
  try { assert.deepEqual(await provider.attachPassageText(reply, new AbortController().signal), reply); }
  finally {
    if (key !== undefined) process.env.BIBLE_API_KEY = key;
    if (id !== undefined) process.env.BIBLE_ID_NVI = id;
  }
});
