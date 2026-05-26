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
  const createConv = useCreateOpenaiConversation();
  const initialized = useRef(false);

  const startSession = useCallback((lang: Language) => {
    createConv.mutateAsync({ data: { title: 'My Day' } })
      .then((conv) => {
        setConversationId(conv.id);
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: WELCOME[lang],
            createdAt: new Date().toISOString(),
          },
        ]);
      })
      .catch((err) => {
        console.error('Failed to init session', err);
      });
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    startSession(language);
  }, []);

  const initSession = useCallback((lang: Language) => {
    setConversationId(null);
    setMessages([]);
    startSession(lang);
  }, [startSession]);

  const sendMessage = async (content: string) => {
    if (!conversationId) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantMsgId = (Date.now() + 1).toString();
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.done) break;
              if (data.content) {
                fullContent += data.content;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullContent } : m))
                );
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: ERROR_MSG[language] }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return { conversationId, messages, sendMessage, isStreaming, initSession };
}
