import { useState, useCallback, useEffect, useRef } from 'react';
import { useCreateOpenaiConversation } from '@workspace/api-client-react';

export type Language = 'en' | 'es';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

const WELCOME: Record<Language, string> = {
  en: 'Welcome. Take a deep breath. How is your heart today?',
  es: 'Bienvenido. Respira hondo. ¿Cómo está tu corazón hoy?',
};

const ERROR_MSG: Record<Language, string> = {
  en: "I'm sorry, I'm having trouble connecting right now. Please try again.",
  es: 'Lo siento, tengo problemas para conectarme ahora mismo. Por favor, inténtalo de nuevo.',
};

export function useChatSession(language: Language) {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const createConv = useCreateOpenaiConversation();
  const sessionGeneration = useRef(0);

  const startSession = useCallback(async (lang: Language) => {
    const generation = ++sessionGeneration.current;
    setIsInitializing(true);
    setIsStreaming(false);
    setSessionError(null);
    setConversationId(null);
    setMessages([]);

    try {
      const conv = await createConv.mutateAsync({ data: { title: 'My Day' } });
      if (generation !== sessionGeneration.current) return;
      setConversationId(conv.id);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: WELCOME[lang],
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      if (generation !== sessionGeneration.current) return;
      console.error('Failed to init session', err);
      setSessionError(ERROR_MSG[lang]);
    } finally {
      if (generation === sessionGeneration.current) {
        setIsInitializing(false);
      }
    }
  }, [createConv.mutateAsync]);

  useEffect(() => {
    startSession(language);
  }, [startSession]);

  const initSession = useCallback((lang: Language) => {
    startSession(lang);
  }, [startSession]);

  const sendMessage = async (content: string) => {
    if (!conversationId || isInitializing || isStreaming) return;
    const generation = sessionGeneration.current;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language }),
      });

      if (!res.ok) throw new Error('Failed to send message');
      if (!res.body) throw new Error('No body in response');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';
      let streamError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        let eventBoundary = buffer.indexOf('\n\n');
        while (eventBoundary !== -1) {
          const event = buffer.slice(0, eventBoundary);
          buffer = buffer.slice(eventBoundary + 2);
          const dataStr = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');

          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (data.error) {
                streamError = data.error;
                break;
              }
              if (data.content) {
                fullContent += data.content;
                if (generation === sessionGeneration.current) {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullContent } : m))
                  );
                }
              }
            } catch {
              streamError = 'The response could not be read. Please try again.';
              break;
            }
          }
          eventBoundary = buffer.indexOf('\n\n');
        }

        if (streamError || done) break;
      }

      if (streamError) throw new Error(streamError);
    } catch (error) {
      console.error(error);
      if (generation === sessionGeneration.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: ERROR_MSG[language] }
              : m
          )
        );
      }
    } finally {
      if (generation === sessionGeneration.current) {
        setIsStreaming(false);
      }
    }
  };

  return {
    conversationId,
    messages,
    sendMessage,
    isStreaming,
    isInitializing,
    sessionError,
    initSession,
  };
}
