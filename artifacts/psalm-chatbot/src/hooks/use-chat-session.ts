import { useState, useCallback, useEffect, useRef } from "react";
import { ChatRequestError, readChatStream } from "@/lib/chat-stream";
import { useAuth } from "@/hooks/use-auth";

export type Language = "en" | "es";
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  error?: string;
};
export type ConversationSummary = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};
type Conversation = ConversationSummary & {
  messages: {
    id: number;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }[];
};
type HistoryPage = {
  conversations: ConversationSummary[];
  nextCursor: string | null;
};
function errorMessage(code: string, language: Language) {
  const es = language === "es";
  if (code === "AI_QUOTA_LIMIT" || code === "HTTP_429")
    return es
      ? "Alcanzamos el límite temporal de consultas. Espera un momento antes de intentarlo de nuevo."
      : "We reached the temporary request limit. Please wait a little before trying again.";
  if (code === "CONVERSATION_LIMIT" || code === "HTTP_413")
    return es
      ? "Esta conversación llegó a su límite. Crea una nueva para continuar; esta quedará en tu historial."
      : "This conversation reached its limit. Start a new one; this one will stay in your history.";
  if (code === "AI_NOT_CONFIGURED")
    return es
      ? "Las recomendaciones aún no están disponibles. Inténtalo más tarde."
      : "Recommendations are not available yet. Please try again later.";
  if (code === "AI_MODEL_UNAVAILABLE")
    return es
      ? "El modelo de recomendaciones dejó de estar disponible. Es necesario actualizar la configuración del servicio."
      : "The recommendation model is no longer available. The service configuration needs to be updated.";
  if (code === "AI_ACCESS_DENIED")
    return es
      ? "El proveedor de IA no permite generar respuestas con esta configuración. Es necesario revisar el acceso del proyecto."
      : "The AI provider does not allow replies with this configuration. Project access needs to be reviewed.";
  if (code === "HTTP_409")
    return es
      ? "Hay otra respuesta en curso para esta conversación. Espera un momento."
      : "Another reply is in progress for this conversation. Please wait a moment.";
  if (code === "HTTP_404")
    return es
      ? "Esta conversación ya no está disponible. Selecciona otra o crea una nueva."
      : "This conversation is no longer available. Select another or start a new one.";
  return es
    ? "No pudimos completar la solicitud. Puedes volver a intentarlo."
    : "We could not complete the request. You can try again.";
}

export function useChatSession(language: Language) {
  const { apiFetch, session } = useAuth();
  const storageKey = `bibleguide-conversation:${session!.user.id}`;
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{
    content: string;
    userId: string;
    assistantId: string;
  } | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const currentSearch = useRef(search);
  currentSearch.current = search;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const historyVersion = useRef(0);
  const sending = useRef(false);
  const currentLanguage = useRef(language);
  currentLanguage.current = language;
  const persist = useCallback(
    (id: number | null) => {
      try {
        localStorage.setItem(storageKey, id ? String(id) : "new");
      } catch {
        /* History is also stored on the server. */
      }
    },
    [storageKey],
  );
  const jsonRequest = useCallback(
    async <T>(
      url: string,
      signal: AbortSignal,
      options: RequestInit = {},
    ): Promise<T> => {
      const response = await apiFetch(url, { ...options, signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ChatRequestError(
          body.error?.startsWith("AI_")
            ? body.error
            : `HTTP_${response.status}`,
        );
      }
      return response.json();
    },
    [apiFetch],
  );
  const refreshHistory = useCallback(
    async (cursor?: string) => {
      historyRequest.current?.abort();
      const controller = new AbortController();
      historyRequest.current = controller;
      const version = ++historyVersion.current;
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const params = new URLSearchParams({ q: currentSearch.current });
        if (cursor) params.set("cursor", cursor);
        const page = await jsonRequest<HistoryPage>(
          `/api/openai/conversations?${params}`,
          controller.signal,
        );
        if (version !== historyVersion.current) return;
        setHistory((previous) =>
          cursor
            ? [
                ...previous,
                ...page.conversations.filter(
                  (item) => !previous.some((old) => old.id === item.id),
                ),
              ]
            : page.conversations,
        );
        setNextCursor(page.nextCursor);
      } catch {
        if (!controller.signal.aborted && version === historyVersion.current)
          setHistoryError(
            currentLanguage.current === "es"
              ? "No pudimos cargar el historial."
              : "We could not load your history.",
          );
      } finally {
        if (version === historyVersion.current) setLoadingHistory(false);
      }
    },
    [jsonRequest],
  );
  useEffect(() => {
    setHistory([]);
    setNextCursor(null);
    const timeout = setTimeout(() => {
      void refreshHistory();
    }, 250);
    return () => {
      clearTimeout(timeout);
      ++historyVersion.current;
      historyRequest.current?.abort();
    };
  }, [refreshHistory, search]);
  const openConversation = useCallback(
    async (id: number | null) => {
      if (sending.current) return;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const version = ++generation.current;
      setIsInitializing(true);
      setSessionError(null);
      setFailed(null);
      setMessages([]);
      setConversationId(id);
      setConversationTitle(null);
      try {
        if (id) {
          const conv = await jsonRequest<Conversation>(
            `/api/openai/conversations/${id}`,
            controller.signal,
          );
          if (version !== generation.current) return;
          setConversationTitle(conv.title);
          setMessages(
            conv.messages.map((message) => ({
              ...message,
              id: String(message.id),
            })),
          );
        }
        if (version === generation.current) persist(id);
      } catch (error) {
        if (!controller.signal.aborted && version === generation.current)
          setSessionError(
            errorMessage(
              error instanceof ChatRequestError ? error.code : "NETWORK_ERROR",
              currentLanguage.current,
            ),
          );
      } finally {
        if (version === generation.current) setIsInitializing(false);
      }
    },
    [jsonRequest, persist],
  );
  useEffect(() => {
    let id: number | null = null;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isSafeInteger(saved) && saved > 0) id = saved;
    } catch {
      /* Storage may be disabled. */
    }
    void openConversation(id);
    return () => {
      ++generation.current;
      activeRequest.current?.abort();
    };
  }, [storageKey, openConversation]);
  const sendMessage = async (content: string) => {
    const text = content.trim();
    if (!text || text.length > 4000 || isInitializing || sending.current)
      return;
    sending.current = true;
    const version = generation.current;
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    const lang = currentLanguage.current;
    const userId = `user-${crypto.randomUUID()}`;
    const assistantId = `assistant-${crypto.randomUUID()}`;
    setMessages((prev) => [
      ...prev.filter(
        (m) =>
          !failed || (m.id !== failed.userId && m.id !== failed.assistantId),
      ),
      {
        id: userId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      },
    ]);
    setFailed(null);
    setIsStreaming(true);
    try {
      let id = conversationId;
      if (!id) {
        const created = await jsonRequest<ConversationSummary>(
          "/api/openai/conversations",
          controller.signal,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: text.replace(/\s+/g, " ").slice(0, 120),
            }),
          },
        );
        if (version !== generation.current) return;
        id = created.id;
        setConversationId(id);
        setConversationTitle(created.title);
        persist(id);
        void refreshHistory();
      }
      const response = await apiFetch(
        `/api/openai/conversations/${id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, language: lang }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ChatRequestError(
          body.error === "CONVERSATION_LIMIT" || body.error?.startsWith("AI_")
            ? body.error
            : `HTTP_${response.status}`,
        );
      }
      await readChatStream(response, (content) => {
        if (version === generation.current)
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
          );
      });
      if (version === generation.current) void refreshHistory();
    } catch (error) {
      if (!controller.signal.aborted && version === generation.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "",
                  error: errorMessage(
                    error instanceof ChatRequestError
                      ? error.code
                      : "NETWORK_ERROR",
                    lang,
                  ),
                }
              : m,
          ),
        );
        setFailed({ content: text, userId, assistantId });
      }
    } finally {
      if (version === generation.current) {
        sending.current = false;
        setIsStreaming(false);
      }
    }
  };
  const renameConversation = async (id: number, title: string) => {
    await jsonRequest(
      `/api/openai/conversations/${id}`,
      new AbortController().signal,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    if (id === conversationId) setConversationTitle(title);
    await refreshHistory();
  };
  const deleteConversation = async (id: number) => {
    const response = await apiFetch(`/api/openai/conversations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("DELETE_FAILED");
    if (id === conversationId) await openConversation(null);
    await refreshHistory();
  };
  return {
    conversationId,
    conversationTitle,
    messages,
    sendMessage,
    isStreaming,
    initSession: () => {
      void openConversation(null);
    },
    isInitializing,
    sessionError,
    retrySession: () => {
      void openConversation(conversationId);
    },
    retryMessage: failed
      ? () => {
          void sendMessage(failed.content);
        }
      : null,
    history,
    search,
    setSearch,
    nextCursor,
    loadingHistory,
    historyError,
    refreshHistory: () => {
      void refreshHistory();
    },
    loadMore: () => {
      if (nextCursor && !loadingHistory) void refreshHistory(nextCursor);
    },
    selectConversation: (id: number) => {
      void openConversation(id);
    },
    renameConversation,
    deleteConversation,
  };
}
