// Loaded only by the explicit integration harness, never by the app launcher.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(
    typeof input === "string" ? input : (input.url ?? input.href),
  );
  if (url.hostname !== "generativelanguage.googleapis.com")
    return originalFetch(input, options);
  const reply = {
    format: "bible-guide-v1",
    message: "Gracias por compartir cómo te sientes.",
    recommendations: [
      {
        book: "MAT",
        chapter: 11,
        verseStart: 28,
        verseEnd: 30,
        summary: "Una invitación a descansar.",
        context: "Jesús invita a quienes llevan cargas.",
        reflection: "Reconoce lo que hoy te pesa y busca una pausa.",
      },
    ],
  };
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(reply) }] },
      },
    ],
  });
};
