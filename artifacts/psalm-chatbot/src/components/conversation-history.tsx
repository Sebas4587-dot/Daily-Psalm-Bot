import { useState, type FormEvent } from "react";
import {
  Leaf,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useChatSession,
  type ConversationSummary,
  type Language,
} from "@/hooks/use-chat-session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  chat: ReturnType<typeof useChatSession>;
  language: Language;
  mobileOpen: boolean;
  onMobileChange: (open: boolean) => void;
};
export function ConversationHistory({
  chat,
  language,
  mobileOpen,
  onMobileChange,
}: Props) {
  const { session, signOut } = useAuth();
  const es = language === "es";
  const [action, setAction] = useState<{
    type: "rename" | "delete";
    conversation: ConversationSummary;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const metadataName =
    session?.user.user_metadata.display_name ??
    session?.user.user_metadata.full_name ??
    session?.user.user_metadata.name;
  const name =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : (session?.user.email?.split("@")[0] ??
        (es ? "Tu cuenta" : "Your account"));
  const perform = async (event: FormEvent) => {
    event.preventDefault();
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action.type === "rename")
        await chat.renameConversation(action.conversation.id, title.trim());
      else await chat.deleteConversation(action.conversation.id);
      setAction(null);
    } catch {
      setError(
        es
          ? "No pudimos guardar el cambio. Inténtalo de nuevo."
          : "We could not save this change. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const openAction = (
    type: "rename" | "delete",
    conversation: ConversationSummary,
  ) => {
    setTitle(conversation.title);
    setError(null);
    setAction({ type, conversation });
  };
  const content = (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col bg-[#eeeae0]">
      <div className="px-5 pb-5 pt-7">
        <div className="mb-8 flex items-center gap-3 text-primary">
          <span className="grid h-10 w-10 place-items-center rounded-2xl border border-primary/20">
            <Leaf size={20} strokeWidth={1.5} />
          </span>
          <div>
            <p className="font-serif text-2xl font-semibold leading-tight tracking-tight">
              {es ? "Guía bíblica" : "BibleGuide"}
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-[.2em]">
              {es ? "Un espacio para ti" : "A space for you"}
            </p>
          </div>
        </div>
        <Button
          className="h-11 w-full justify-start gap-3 rounded-xl"
          disabled={chat.isStreaming || chat.isInitializing}
          onClick={() => {
            chat.initSession();
            onMobileChange(false);
          }}
        >
          <Plus size={17} />
          {es ? "Nueva conversación" : "New conversation"}
        </Button>
      </div>
      <div className="px-5 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">
            {es ? "Tu historial" : "Your history"}
          </h2>
          <LockKeyhole
            size={12}
            className="text-primary/65"
            aria-hidden="true"
          />
        </div>
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
          />
          <input
            aria-label={es ? "Buscar conversaciones" : "Search conversations"}
            placeholder={
              es ? "Buscar una conversación…" : "Search conversations…"
            }
            maxLength={120}
            value={chat.search}
            onChange={(e) => chat.setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border/70 bg-background/60 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>
      <nav
        aria-label={es ? "Conversaciones guardadas" : "Saved conversations"}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-5"
      >
        {chat.history.map((conversation) => (
          <div
            key={conversation.id}
            className={`group mb-1 flex items-center rounded-xl border ${conversation.id === chat.conversationId ? "border-primary/15 bg-background/85 shadow-sm" : "border-transparent hover:bg-background/45"}`}
          >
            <button
              type="button"
              disabled={chat.isStreaming || chat.isInitializing}
              aria-current={
                conversation.id === chat.conversationId ? "page" : undefined
              }
              onClick={() => {
                chat.selectConversation(conversation.id);
                onMobileChange(false);
              }}
              className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl py-3 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              data-testid={`history-conversation-${conversation.id}`}
            >
              <MessageCircle
                size={15}
                className="mt-0.5 shrink-0 text-primary/65"
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {conversation.title}
                </span>
                <time
                  dateTime={conversation.updatedAt}
                  className="mt-1 block text-[10px] text-muted-foreground"
                >
                  {new Intl.DateTimeFormat(es ? "es" : "en", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(conversation.updatedAt))}
                </time>
              </span>
            </button>
            <div className="flex shrink-0 flex-col pr-1">
              <button
                type="button"
                disabled={chat.isStreaming}
                aria-label={`${es ? "Renombrar" : "Rename"}: ${conversation.title}`}
                onClick={() => openAction("rename", conversation)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                disabled={chat.isStreaming}
                aria-label={`${es ? "Eliminar" : "Delete"}: ${conversation.title}`}
                onClick={() => openAction("delete", conversation)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {!chat.loadingHistory && !chat.history.length && !chat.historyError && (
          <p className="px-4 py-8 text-center text-xs leading-6 text-muted-foreground">
            {chat.search
              ? es
                ? "No encontramos conversaciones con ese título."
                : "No conversations match that title."
              : es
                ? "Aquí se guardará tu historia. Comienza una conversación cuando quieras."
                : "Your story will be saved here. Start a conversation whenever you are ready."}
          </p>
        )}
        {chat.loadingHistory && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground"
          >
            <LoaderCircle className="animate-spin" size={14} />
            {es ? "Cargando historial…" : "Loading history…"}
          </p>
        )}
        {chat.historyError && (
          <div role="alert" className="px-3 py-4 text-center text-xs">
            <p>{chat.historyError}</p>
            <button
              onClick={chat.refreshHistory}
              className="mt-2 text-primary underline"
            >
              {es ? "Reintentar" : "Try again"}
            </button>
          </div>
        )}
        {chat.nextCursor && !chat.loadingHistory && (
          <Button
            variant="ghost"
            className="mt-2 w-full text-xs"
            onClick={chat.loadMore}
          >
            {es ? "Ver conversaciones anteriores" : "Load older conversations"}
          </Button>
        )}
      </nav>
      <div className="shrink-0 border-t border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 font-serif text-lg text-primary"
            aria-hidden="true"
          >
            {name[0]?.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {session?.user.email}
            </p>
          </div>
          <button
            type="button"
            aria-label={es ? "Cerrar sesión" : "Sign out"}
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              setLogoutError(false);
              try {
                await signOut();
              } catch {
                setLogoutError(true);
              } finally {
                setLoggingOut(false);
              }
            }}
            className="rounded-lg p-2 text-muted-foreground hover:bg-primary/8 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            {loggingOut ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <LogOut size={16} />
            )}
          </button>
        </div>
        {logoutError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {es
              ? "No pudimos cerrar la sesión. Reinténtalo."
              : "Could not sign out. Please try again."}
          </p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <LockKeyhole size={10} />
          {es
            ? "Historial privado de tu cuenta"
            : "Your account’s private history"}
        </p>
      </div>
    </div>
  );
  return (
    <>
      <aside
        className="hidden h-[100dvh] w-[286px] shrink-0 border-r border-border/70 lg:block"
        aria-label={es ? "Tu espacio personal" : "Your personal space"}
      >
        {content}
      </aside>
      <Dialog open={mobileOpen} onOpenChange={onMobileChange}>
        <DialogContent className="left-0 top-0 flex h-[100dvh] w-[min(90vw,340px)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0 sm:rounded-none data-[state=open]:animate-none data-[state=closed]:animate-none">
          <DialogTitle className="sr-only">
            {es ? "Tu historial" : "Your history"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {es
              ? "Tus conversaciones y tu cuenta"
              : "Your conversations and account"}
          </DialogDescription>
          {content}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] rounded-2xl">
          <DialogTitle>
            {action?.type === "delete"
              ? es
                ? "¿Eliminar esta conversación?"
                : "Delete this conversation?"
              : es
                ? "Un nombre para tu conversación"
                : "Name your conversation"}
          </DialogTitle>
          <DialogDescription>
            {action?.type === "delete"
              ? es
                ? "Se eliminarán todos sus mensajes. Esta acción no se puede deshacer."
                : "All its messages will be deleted. This cannot be undone."
              : es
                ? "Elige un título que te ayude a encontrarla después."
                : "Choose a title that helps you find it later."}
          </DialogDescription>
          <form onSubmit={perform} className="space-y-5">
            {action?.type === "rename" ? (
              <input
                aria-label={
                  es ? "Título de la conversación" : "Conversation title"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
                disabled={busy}
                className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            ) : (
              <p className="truncate text-sm font-medium">
                {action?.conversation.title}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                {es ? "Cancelar" : "Cancel"}
              </Button>
              <Button
                type="submit"
                variant={action?.type === "delete" ? "destructive" : "default"}
                disabled={busy || (action?.type === "rename" && !title.trim())}
              >
                {busy ? (
                  <LoaderCircle className="mr-2 animate-spin" size={16} />
                ) : null}
                {action?.type === "delete"
                  ? es
                    ? "Eliminar"
                    : "Delete"
                  : es
                    ? "Guardar"
                    : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
