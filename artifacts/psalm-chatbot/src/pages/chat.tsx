import { useState, useRef, useEffect } from "react";
import { SendHorizontal, RotateCcw } from "lucide-react";
import { useChatSession, type Language } from "@/hooks/use-chat-session";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PsalmCard } from "@/components/psalm-card";

const UI = {
  en: {
    startAnew: "Start Anew",
    placeholder: "Share your thoughts...",
    typing: "...",
  },
  es: {
    startAnew: "Empezar de nuevo",
    placeholder: "Comparte tus pensamientos...",
    typing: "...",
  },
} as const;

function parseMessage(content: string) {
  const parts = content.split('---PSALM_CARD---');
  if (parts.length === 1) return { text: parts[0], psalm: null };

  const text = parts[0].trim();
  const cardText = parts[1].trim();

  const refMatch = cardText.match(/Reference:\s*(.*)/i);
  const verseMatch = cardText.match(/Verse:\s*"?([^"]*)"?/i);
  const refTextMatch = cardText.match(/Reflection:\s*([\s\S]*)/i);

  if (refMatch && verseMatch && refTextMatch) {
    return {
      text,
      psalm: {
        reference: refMatch[1].trim(),
        verse: verseMatch[1].trim(),
        reflection: refTextMatch[1].trim(),
      },
    };
  }

  return { text: content, psalm: null };
}

export default function Chat() {
  const [language, setLanguage] = useState<Language>('en');
  const { messages, sendMessage, isStreaming, initSession } = useChatSession(language);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleLanguageSwitch = (lang: Language) => {
    if (lang === language) return;
    setLanguage(lang);
    initSession(lang);
  };

  const ui = UI[language];

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10 sticky top-0">
        <h1 className="font-serif text-2xl font-semibold text-primary tracking-wide">PsalmGuide</h1>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center rounded-full border border-border/60 overflow-hidden text-sm font-medium"
            data-testid="language-toggle"
          >
            <button
              onClick={() => handleLanguageSwitch('en')}
              className={`px-3 py-1.5 transition-colors ${
                language === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              data-testid="button-lang-en"
            >
              EN
            </button>
            <button
              onClick={() => handleLanguageSwitch('es')}
              className={`px-3 py-1.5 transition-colors ${
                language === 'es'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              data-testid="button-lang-es"
            >
              ES
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => initSession(language)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-new-session"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {ui.startAnew}
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 px-4 py-8" ref={scrollRef}>
        <div className="max-w-2xl mx-auto space-y-10 pb-8">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const { text, psalm } = parseMessage(msg.content);

            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] text-lg leading-relaxed ${
                    isUser
                      ? "bg-secondary text-secondary-foreground px-6 py-4 rounded-2xl rounded-br-sm shadow-sm"
                      : "text-foreground py-2"
                  }`}
                  data-testid={isUser ? `bubble-user-${msg.id}` : `bubble-assistant-${msg.id}`}
                >
                  <p className={isUser ? "font-sans" : "font-serif text-xl"}>{text}</p>
                </div>

                {psalm && (
                  <div className="mt-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <PsalmCard {...psalm} />
                  </div>
                )}
              </div>
            );
          })}

          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-start">
              <div className="text-foreground py-2 font-serif text-xl animate-pulse">
                {ui.typing}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <footer className="p-4 bg-background/80 backdrop-blur-sm border-t border-border/50">
        <div className="max-w-2xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 bg-card rounded-2xl p-2 shadow-sm border border-card-border transition-all focus-within:ring-1 focus-within:ring-primary/30"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ui.placeholder}
              className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:ring-0 px-4 py-3 font-sans text-foreground placeholder:text-muted-foreground outline-none"
              rows={1}
              data-testid="input-message"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isStreaming}
              className="rounded-xl h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="button-send-message"
            >
              <SendHorizontal className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </footer>
    </div>
  );
}
