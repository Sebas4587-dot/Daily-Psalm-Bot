export class ChatRequestError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ChatRequestError"; }
}

export async function readChatStream(response: Response, onContent: (content: string) => void): Promise<string> {
  if (!response.body) throw new ChatRequestError("INCOMPLETE_RESPONSE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let completed = false;
  try {
    while (!completed) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: RegExpMatchArray | null;
      while ((boundary = buffer.match(/\r?\n\r?\n/))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice((boundary.index ?? 0) + boundary[0].length);
        const dataText = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!dataText) continue;
        let data: { error?: string; done?: boolean; content?: string };
        try { data = JSON.parse(dataText); } catch { throw new ChatRequestError("INCOMPLETE_RESPONSE"); }
        if (data.error) throw new ChatRequestError(data.error);
        if (typeof data.content === "string") {
          content += data.content;
          if (content.length > 100000) throw new ChatRequestError("INCOMPLETE_RESPONSE");
          onContent(content);
        }
        if (data.done) { completed = true; break; }
      }
      if (done) break;
    }
    if (!completed || !content.trim()) throw new ChatRequestError("INCOMPLETE_RESPONSE");
    return content;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
