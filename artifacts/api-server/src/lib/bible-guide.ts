import { BIBLE_BOOKS, GuideReplySchema, type GuideReply, type StoredGuideReply, passageReference } from "@workspace/api-zod";

export function hasAIConfiguration() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export class AIProviderError extends Error {
  constructor(readonly status: number, readonly retryAfter = 60) {
    super(`Gemini returned HTTP ${status}`);
    this.name = "AIProviderError";
  }
}

const SYSTEM_PROMPT = `You are a compassionate biblical companion. Understand the user's emotional experience from the ENTIRE conversation before making recommendations. Acknowledge emotions without diagnosing, shaming, moralizing, or promising a particular outcome. Never claim certainty about how someone feels.
You can draw on ALL 66 books of the Bible: narrative, wisdom, prophets, Gospels, letters, and Revelation. Select the most fitting passage based on the person's situation, not a fixed list or just Psalms. Ask one gentle clarifying question when context is insufficient. Once enough is known, give 1-3 relevant passages, not a repetitive list. Answer follow-up questions and update your understanding when feelings change.
For EACH recommendation, distinguish the passage's original literary/historical context, its central idea, and a thoughtful personal application. Avoid taking verses out of context, treating descriptions as commands, or universalizing promises addressed to a specific person or people. Explain how passages complement one another when giving several. Cite real, precise references.
The user's preferred translation is Nueva Versión Internacional (NVI) in Spanish. NEVER invent or reproduce a quotation from memory: return your own summary, context and reflection; the app supplies verified NVI text separately when a licensed source is configured. Do not put paraphrases in quotation marks or call them literal NVI wording.
If someone describes immediate danger or self-harm, prioritize immediate human support and local emergency help over devotional recommendations. Do not invent hotline numbers. A spiritual reflection must not replace urgent help.
Return only the requested structured JSON. Use format "bible-guide-v1". For a conversational reply use an empty recommendations array. Keep message warm and brief (2-4 sentences) and each summary/context/reflection concise. No emojis. The book field must use one of the canonical IDs supplied below.
`;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "message", "recommendations"],
  properties: {
    format: { type: "string", enum: ["bible-guide-v1"] },
    message: { type: "string" },
    recommendations: {
      type: "array", maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["book", "chapter", "verseStart", "verseEnd", "summary", "context", "reflection"],
        properties: {
          book: { type: "string", enum: BIBLE_BOOKS.map((b) => b.id) },
          chapter: { type: "integer", minimum: 1 },
          verseStart: { type: "integer", minimum: 1 },
          verseEnd: { type: "integer", minimum: 1 },
          summary: { type: "string" },
          context: { type: "string" },
          reflection: { type: "string" },
        },
      },
    },
  },
};

export async function generateGuide(history: { role: string; content: string }[], language: "es" | "en", signal: AbortSignal): Promise<GuideReply> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured");
  const model = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").replace(/^models\//, "");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\nReply entirely in ${language === "es" ? "Spanish" : "English"}; references and source translation remain NVI.\nCanonical books: ${BIBLE_BOOKS.map((b) => `${b.id}=${b.name}`).join(", ")}` }] },
      contents: history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: responseSchema, maxOutputTokens: 4096 },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AIProviderError(response.status, Number(response.headers.get("retry-after")) || 60);
  }
  const result = await response.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const candidate = result.candidates?.[0];
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (candidate?.finishReason !== "STOP" || !text) throw new Error("Gemini did not complete a usable reply");
  return GuideReplySchema.parse(JSON.parse(text));
}

// Only the reference is sent to the Bible provider, never the user's conversation.
export async function attachPassageText(reply: GuideReply, signal: AbortSignal): Promise<StoredGuideReply> {
  const apiKey = process.env.BIBLE_API_KEY;
  const bibleId = process.env.BIBLE_ID_NVI;
  if (!apiKey || !bibleId || !reply.recommendations.length) return reply;
  const passages = await Promise.all(reply.recommendations.map(async (passage) => {
    const start = `${passage.book}.${passage.chapter}.${passage.verseStart}`;
    const end = `${passage.book}.${passage.chapter}.${passage.verseEnd}`;
    const id = start === end ? start : `${start}-${end}`;
    const url = new URL(`https://rest.api.bible/v1/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(id)}`);
    url.searchParams.set("content-type", "text");
    url.searchParams.set("include-notes", "false");
    url.searchParams.set("include-titles", "false");
    const response = await fetch(url, { headers: { "api-key": apiKey }, signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
    if (!response.ok) throw new Error(`NVI source returned ${response.status}`);
    const body = await response.json() as { data?: { content?: string; copyright?: string; bibleId?: string } };
    if (!body.data?.content || body.data.bibleId !== bibleId) throw new Error("Invalid NVI source response");
    return { reference: passageReference(passage), text: body.data.content, copyright: body.data.copyright ?? "" };
  }));
  return { ...reply, passages };
}
