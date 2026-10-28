import { useState, useCallback, useEffect, useRef } from "react";
import { ChatRequestError, readChatStream } from "@/lib/chat-stream";

export type Language = "en" | "es";
export type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; error?: string };
type Conversation = { id: number; messages: { id: number; role: "user" | "assistant"; content: string; createdAt: string }[] };
const STORAGE_KEY = "bibleguide-conversation";
function savedConversation() {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}
function saveConversation(id: number) {
  try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* cookies still preserve ownership */ }
}
const WELCOME = { en: "Welcome. How is your heart today?", es: "Bienvenido. ¿Cómo está tu corazón hoy?" };
function errorMessage(code: string, language: Language) {
  const es = language === "es";
  if (code === "AI_QUOTA_LIMIT" || code === "HTTP_429") return es ? "Alcanzamos el límite temporal de consultas. Espera un momento antes de intentarlo de nuevo." : "We reached the temporary request limit. Please wait a little before trying again.";
  if (code === "CONVERSATION_LIMIT" || code === "HTTP_413") return es ? "Esta conversación llegó a su límite. Elige Empezar de nuevo para continuar." : "This conversation reached its limit. Choose Start anew to continue.";
  if (code === "AI_NOT_CONFIGURED") return es ? "Las recomendaciones aún no están disponibles. Inténtalo más tarde." : "Recommendations are not available yet. Please try again later.";
  if (code === "AI_MODEL_UNAVAILABLE") return es ? "El modelo de recomendaciones dejó de estar disponible. Es necesario actualizar la configuración del servicio." : "The recommendation model is no longer available. The service configuration needs to be updated.";
  if (code === "AI_ACCESS_DENIED") return es ? "El proveedor de IA no permite generar respuestas con esta configuración. Es necesario revisar el acceso del proyecto." : "The AI provider does not allow replies with this configuration. Project access needs to be reviewed.";
  if (code === "HTTP_409") return es ? "Hay otra respuesta en curso para esta conversación. Espera un momento." : "Another reply is in progress for this conversation. Please wait a moment.";
  return es ? "No pudimos completar la respuesta. Puedes volver a intentarlo." : "We could not complete the response. You can try again.";
}
async function jsonRequest<T>(url: string, signal: AbortSignal, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, signal, credentials: "same-origin" });
  if (!response.ok) throw new ChatRequestError(`HTTP_${response.status}`);
  return response.json();
}

export function useChatSession(language: Language) {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ content: string; userId: string; assistantId: string } | null>(null);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const currentLanguage = useRef(language);
  currentLanguage.current = language;

  const startSession = useCallback(async (lang: Language, forceNew = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const version = ++generation.current;
    sending.current = false;
    setIsInitializing(true);
    setIsStreaming(false);
    setSessionError(null);
    setConversationId(null);
    setFailed(null);
    setMessages([]);
    try {
      // Establish the private browser session before creating or restoring a chat.
      const config = await jsonRequest<{ aiConfigured: boolean }>("/api/openai/configuration", controller.signal);
      if (!config.aiConfigured) throw new ChatRequestError("AI_NOT_CONFIGURED");
      let conv: Conversation | null = null;
      if (!forceNew) {
        const id = savedConversation();
        if (id) {
          try { conv = await jsonRequest<Conversation>(`/api/openai/conversations/${id}`, controller.signal); }
          catch (error) { if (!(error instanceof ChatRequestError && error.code === "HTTP_404")) throw error; }
        } else {
          const recent = await jsonRequest<{ id: number }[]>("/api/openai/conversations", controller.signal);
          if (recent[0]) conv = await jsonRequest<Conversation>(`/api/openai/conversations/${recent[0].id}`, controller.signal);
        }
      }
      if (!conv) {
        const created = await jsonRequest<{ id: number }>("/api/openai/conversations", controller.signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: lang === "es" ? "Mi conversación" : "My conversation" }) });
        conv = { id: created.id, messages: [] };
      }
      if (version !== generation.current) return;
      saveConversation(conv.id);
      setConversationId(conv.id);
      setMessages(conv.messages.length ? conv.messages.map((m) => ({ ...m, id: String(m.id) })) : [{ id: "welcome", role: "assistant", content: WELCOME[lang], createdAt: new Date().toISOString() }]);
    } catch (error) {
      if (!controller.signal.aborted && version === generation.current) setSessionError(errorMessage(error instanceof ChatRequestError ? error.code : "NETWORK_ERROR", lang));
    } finally {
      if (version === generation.current) setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    void startSession(currentLanguage.current);
    return () => { ++generation.current; activeRequest.current?.abort(); };
  }, [startSession]);

  const initSession = useCallback((lang: Language) => { void startSession(lang, true); }, [startSession]);
  const sendMessage = async (content: string) => {
    const text = content.trim();
    if (!text || text.length > 4000 || !conversationId || isInitializing || sending.current) return;
    sending.current = true;
    const version = generation.current;
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    const lang = currentLanguage.current;
    const userId = `user-${crypto.randomUUID()}`;
    const assistantId = `assistant-${crypto.randomUUID()}`;
    setMessages((prev) => [
      ...prev.filter((m) => !failed || (m.id !== failed.userId && m.id !== failed.assistantId)),
      { id: userId, role: "user", content: text, createdAt: new Date().toISOString() },
      { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() },
    ]);
    setFailed(null);
    setIsStreaming(true);
    try {
      const response = await fetch(`/api/openai/conversations/${conversationId}/messages`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, language: lang }), signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ChatRequestError(body.error === "CONVERSATION_LIMIT" || body.error === "AI_NOT_CONFIGURED" ? body.error : `HTTP_${response.status}`);
      }
      await readChatStream(response, (content) => {
        if (version === generation.current) setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content } : m));
      });
    } catch (error) {
      if (!controller.signal.aborted && version === generation.current) {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "", error: errorMessage(error instanceof ChatRequestError ? error.code : "NETWORK_ERROR", lang) } : m));
        setFailed({ content: text, userId, assistantId });
      }
    } finally {
      if (version === generation.current) { sending.current = false; setIsStreaming(false); }
    }
  };

  return { conversationId, messages, sendMessage, isStreaming, initSession, isInitializing, sessionError, retryMessage: failed ? () => { void sendMessage(failed.content); } : null };
}
