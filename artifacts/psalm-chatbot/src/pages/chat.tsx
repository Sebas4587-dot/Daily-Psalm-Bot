import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Check, CircleAlert, LockKeyhole, Menu, RotateCcw, Sparkles } from "lucide-react";
import { useChatSession, type Language } from "@/hooks/use-chat-session";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PsalmCard } from "@/components/psalm-card";
import { ScriptureCard } from "@/components/scripture-card";
import { StoredGuideReplySchema, type StoredGuideReply } from "@workspace/api-zod";
import { ConversationHistory } from "@/components/conversation-history";

const UI = {
  en: {
    startAnew: "Start anew",
    placeholder: "Share what’s on your heart…",
    typing: "A moment of quiet…",
    initializing: "Making a quiet space for you",
    brandSubtitle: "The whole Bible · NVI",
    eyebrow: "A quiet place to begin",
    welcomeTitle: "How is your heart\ntoday?",
    welcomeBody: "Bring whatever is with you: a worry, a small joy, or something you can’t quite name. We’ll explore passages from across the Bible, with context and a reading in the Spanish NVI.",
    promptsLabel: "You might begin with",
    prompts: ["I feel a little overwhelmed", "I’m grateful for something today", "I need comfort and hope"],
    privacy: "Share only what feels comfortable.",
    greeting: "Welcome. Take a deep breath. How is your heart today?",
    errorTitle: "We couldn’t open your quiet space.",
    retry: "Try again",
    messageLabel: "Your message",
    send: "Send message",
    language: "Language",
    hint: "Enter to send · Shift + Enter for a new line",
  },
  es: {
    startAnew: "Empezar de nuevo",
    placeholder: "Comparte lo que llevas en el corazón…",
    typing: "Un momento de calma…",
    initializing: "Estamos preparando un espacio tranquilo",
    brandSubtitle: "Toda la Biblia · NVI",
    eyebrow: "Un lugar tranquilo para comenzar",
    welcomeTitle: "¿Cómo está tu\n corazón hoy?",
    welcomeBody: "Trae contigo lo que sea: una preocupación, una pequeña alegría o algo que aún no sabes nombrar. Encontraremos pasajes de toda la Biblia, con su contexto y una lectura en la Nueva Versión Internacional.",
    promptsLabel: "Podrías comenzar con",
    prompts: ["Siento que todo me sobrepasa un poco", "Hoy agradezco algo", "Necesito consuelo y esperanza"],
    privacy: "Comparte solo lo que te resulte cómodo.",
    greeting: "Bienvenido. Respira hondo. ¿Cómo está tu corazón hoy?",
    errorTitle: "No pudimos abrir tu espacio de calma.",
    retry: "Intentar de nuevo",
    messageLabel: "Tu mensaje",
    send: "Enviar mensaje",
    language: "Idioma",
    hint: "Enter para enviar · Shift + Enter para nueva línea",
  },
} as const;

function parseMessage(content: string) {
  let reply: StoredGuideReply | null = null;
  try {
    const parsed = StoredGuideReplySchema.safeParse(JSON.parse(content));
    if (parsed.success) reply = parsed.data;
  } catch { /* Earlier conversations contain plain text. */ }
  if (reply) return { text: reply.message, psalm: null, reply };
  const parts = content.split("---PSALM_CARD---");
  if (parts.length === 1) return { text: parts[0], psalm: null, reply };

  const text = parts[0].trim();
  const cardText = parts[1].trim();
  const refMatch = cardText.match(/Reference:\s*(.*)/i);
  const verseMatch = cardText.match(/Verse:\s*([\s\S]*?)(?=\nReflection:|$)/i);
  const refTextMatch = cardText.match(/Reflection:\s*([\s\S]*)/i);

  if (refMatch && verseMatch && refTextMatch) {
    return {
      text,
      reply,
      psalm: {
        reference: refMatch[1].trim(),
        verse: verseMatch[1].trim().replace(/^["“]|["”]$/g, ""),
        reflection: refTextMatch[1].trim(),
      },
    };
  }
  return { text: content, psalm: null, reply };
}

export default function Chat() {
  const [language, setLanguage] = useState<Language>(() => {
    let savedLanguage: string | null = null;
    try { savedLanguage = localStorage.getItem("psalmguide-language"); } catch { /* storage can be disabled */ }
    if (savedLanguage === "en" || savedLanguage === "es") return savedLanguage;
    return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
  });
  const chat = useChatSession(language);
  const { messages, sendMessage, isStreaming, initSession, isInitializing, sessionError, retryMessage, retrySession } = chat;
  const [mobileHistory, setMobileHistory] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ui = UI[language];
  const conversationMessages = useMemo(() => messages.filter((message) => message.id !== "welcome"), [messages]);
  const isWelcome = conversationMessages.length === 0;

  useEffect(() => {
    try { localStorage.setItem("psalmguide-language", language); } catch { /* storage can be disabled */ }
    document.documentElement.lang = language;
    document.title = language === "es" ? "Guía bíblica · NVI" : "BibleGuide · NVI";
  }, [language]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isStreaming]);
  useEffect(() => { setInput(""); }, [chat.conversationId]);

  const submitMessage = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || isInitializing || sessionError) return;
    sendMessage(trimmed);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitMessage(input);
    }
  };

  const handleInput = (value: string) => {
    setInput(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden">
    <ConversationHistory chat={chat} language={language} mobileOpen={mobileHistory} onMobileChange={setMobileHistory} />
    <main className="psalm-shell soft-grain flex h-[100dvh] min-h-[520px] min-w-0 flex-1 flex-col overflow-hidden text-foreground">
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-border/55 bg-background/75 px-4 py-3 backdrop-blur-md sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center gap-3 pr-2">
          <button type="button" onClick={() => setMobileHistory(true)} aria-label={language === "es" ? "Abrir historial" : "Open history"} className="rounded-xl border border-border p-2.5 text-primary focus-visible:ring-2 focus-visible:ring-primary lg:hidden"><Menu size={18} /></button>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-medium leading-tight tracking-tight text-primary sm:text-xl">{chat.conversationTitle ?? (language === "es" ? "Tu espacio de calma" : "Your quiet space")}</h1>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><LockKeyhole size={10} aria-hidden="true" />{language === "es" ? "Conversación privada · NVI" : "Private conversation · NVI"}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="flex rounded-full border border-border/80 bg-background/75 p-1" aria-label={ui.language} data-testid="language-toggle">
            {(["en", "es"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                aria-pressed={language === lang}
                className={`min-w-10 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  language === lang ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                data-testid={`button-lang-${lang}`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <Button
            variant="ghost"
            size="sm"
            onClick={initSession}
            disabled={isInitializing || isStreaming}
            className="h-9 rounded-full px-2 text-muted-foreground transition-colors hover:bg-primary/7 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-3"
            data-testid="button-new-session"
          >
            <RotateCcw className="mr-0 h-4 w-4 sm:mr-2" aria-hidden="true" />
            <span className="hidden sm:inline">{ui.startAnew}</span>
            <span className="sr-only sm:hidden">{ui.startAnew}</span>
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1 px-4 sm:px-6" ref={scrollRef}>
        <div className="mx-auto flex min-h-full w-full max-w-[740px] flex-col pb-8 pt-7 sm:pt-10">
          {sessionError ? (
            <section className="arrive my-auto flex flex-col items-center px-5 py-16 text-center" role="alert" data-testid="status-session-error">
              <div className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-destructive/8 text-destructive">
                <CircleAlert className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="font-serif text-2xl text-foreground">{ui.errorTitle}</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{sessionError}</p>
              <Button onClick={retrySession} className="mt-6 rounded-full px-5 focus-visible:ring-2 focus-visible:ring-primary/40" data-testid="button-retry-session">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />{ui.retry}
              </Button>
            </section>
          ) : isInitializing && messages.length === 0 ? (
            <section className="my-auto flex flex-col items-center py-20 text-center" aria-live="polite" data-testid="status-initializing">
              <div className="mb-5 h-11 w-11 animate-pulse rounded-full border border-primary/15 bg-primary/8" />
              <p className="text-sm text-muted-foreground">{ui.initializing}</p>
            </section>
          ) : isWelcome ? (
            <section className="arrive my-auto flex flex-col items-center py-8 text-center sm:py-12" data-testid="welcome-empty-state">
              <div className="relative mb-7 grid h-[76px] w-[76px] place-items-center rounded-[28px] border border-primary/10 bg-primary/5 text-primary">
                <div className="absolute inset-[7px] rounded-[22px] border border-primary/10" />
                <Sparkles className="h-7 w-7" strokeWidth={1.4} aria-hidden="true" />
              </div>
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[.23em] text-primary/75">{ui.eyebrow}</p>
              <h2 className="whitespace-pre-line font-serif text-[clamp(2.4rem,7vw,4rem)] font-medium leading-[1.03] tracking-[-.045em] text-foreground">
                {ui.welcomeTitle}
              </h2>
              <p className="mt-5 max-w-[470px] text-[15px] leading-[1.8] text-muted-foreground sm:text-base">{ui.welcomeBody}</p>

              <div className="mt-9 w-full max-w-[600px]">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground/80">{ui.promptsLabel}</p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {ui.prompts.map((prompt, index) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => submitMessage(prompt)}
                      disabled={isInitializing || !!sessionError}
                      className="group flex items-center gap-2 rounded-full border border-border/75 bg-background/65 px-4 py-2.5 text-left text-[13px] text-foreground/85 shadow-[0_2px_10px_hsl(176_27%_18%_/.025)] transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid={`button-starter-prompt-${index}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-accent/80 transition-colors group-hover:bg-primary" />
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground/75">
                <Check className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />{ui.privacy}
              </p>
            </section>
          ) : (
            <div className="space-y-8 py-3 sm:space-y-10" aria-live="polite" data-testid="message-thread">
              {conversationMessages.map((message) => {
                const isUser = message.role === "user";
                const { text, psalm, reply } = message.role === "assistant" ? parseMessage(message.content) : { text: message.content, psalm: null, reply: null };
                return (
                  <article key={message.id} className={`arrive flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                    {text && (
                      <div
                        className={`max-w-[90%] break-words text-[15px] leading-[1.75] sm:max-w-[82%] sm:text-base ${
                          isUser
                            ? "rounded-[22px] rounded-br-[7px] border border-primary/5 bg-primary px-5 py-3.5 text-primary-foreground shadow-[0_8px_24px_hsl(169_30%_34%_/.11)] sm:px-6"
                            : "rounded-[22px] rounded-bl-[7px] border border-border/55 bg-background/70 px-5 py-4 text-foreground shadow-[0_5px_20px_hsl(176_27%_18%_/.035)] sm:px-6"
                        }`}
                        data-testid={`${isUser ? "bubble-user" : "bubble-assistant"}-${message.id}`}
                      >
                        <p className="whitespace-pre-wrap">{text}</p>
                      </div>
                    )}
                    {psalm && (
                      <div className="mt-5 w-full sm:mt-6" data-testid={`psalm-card-${message.id}`}>
                        <PsalmCard {...psalm} />
                      </div>
                    )}
                    {reply?.recommendations.map((recommendation, index) => (
                      <div key={`${recommendation.book}-${recommendation.chapter}-${recommendation.verseStart}-${index}`} className="mt-5 w-full sm:mt-6">
                        <ScriptureCard recommendation={recommendation} passage={reply.passages?.[index]} language={language} />
                      </div>
                    ))}
                    {message.error && (
                      <div className="rounded-2xl border border-destructive/20 bg-background/80 p-4 text-sm" role="alert" data-testid="message-error">
                        <p>{message.error}</p>
                        {retryMessage && <Button variant="outline" size="sm" onClick={retryMessage} disabled={isStreaming} className="mt-3">{ui.retry}</Button>}
                      </div>
                    )}
                  </article>
                );
              })}
              {isStreaming && (
                <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground" role="status" data-testid="status-streaming">
                  <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-2">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/80" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/55 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/30 [animation-delay:240ms]" />
                  </span>
                  <span>{ui.typing}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <footer className="relative z-10 shrink-0 border-t border-border/45 bg-background/78 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-6 sm:pt-4">
        <div className="mx-auto max-w-[740px]">
          <form
            onSubmit={handleSubmit}
            className="group flex items-end gap-2 rounded-[22px] border border-border/75 bg-card/80 p-2 shadow-[0_8px_30px_hsl(176_27%_18%_/.055)] transition-[border-color,box-shadow] focus-within:border-primary/35 focus-within:shadow-[0_8px_32px_hsl(169_30%_34%_/.10)]"
            aria-label={ui.messageLabel}
          >
            <label className="sr-only" htmlFor="message-composer">{ui.messageLabel}</label>
            <textarea
              id="message-composer"
              ref={textareaRef}
              value={input}
              onChange={(event) => handleInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ui.placeholder}
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-[14px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/75 focus-visible:ring-0 sm:px-4 sm:text-[15px]"
              rows={1}
              maxLength={4000}
              disabled={isInitializing || !!sessionError}
              data-testid="input-message"
            />
            <Button
              type="submit"
              size="icon"
              aria-label={ui.send}
              disabled={!input.trim() || isStreaming || isInitializing || !!sessionError}
              className="h-11 w-11 shrink-0 rounded-[16px] bg-primary text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:bg-primary/25 disabled:text-primary-foreground/70 disabled:shadow-none"
              data-testid="button-send-message"
            >
              <ArrowUp className="h-[19px] w-[19px]" strokeWidth={2.2} aria-hidden="true" />
            </Button>
          </form>
          <div className="flex items-center justify-between px-2 pt-2.5">
            <p className="hidden text-[10px] text-muted-foreground/70 sm:block">{ui.hint}</p>
            <p className="ml-auto text-[10px] tracking-[.025em] text-muted-foreground/65">{ui.privacy}</p>
          </div>
        </div>
      </footer>
    </main>
    </div>
  );
}
