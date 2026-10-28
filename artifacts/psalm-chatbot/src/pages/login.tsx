import { useEffect, useState } from "react";
import { Redirect } from "wouter";
import { BookOpen, Leaf, LockKeyhole, LoaderCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.41 14.41 0 0 1 0-9.18l-7.98-6.19a23.94 23.94 0 0 0 0 21.56l7.98-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}
export default function Login() {
  const {
    session,
    error: configurationError,
    oauthError,
    signInWithGoogle,
    retry,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Tu espacio · Guía bíblica";
    document.documentElement.lang = "es";
    const show = () => setBusy(false);
    window.addEventListener("pageshow", show);
    return () => window.removeEventListener("pageshow", show);
  }, []);
  if (session) return <Redirect to="/" />;
  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError(
        "No pudimos abrir el acceso con Google. Revisa la conexión e inténtalo de nuevo.",
      );
      setBusy(false);
    }
  };
  return (
    <main className="psalm-shell soft-grain min-h-[100dvh] p-5 sm:p-10 lg:grid lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:p-14">
      <section className="flex flex-col lg:min-h-[calc(100dvh-7rem)]">
        <a
          href={import.meta.env.BASE_URL}
          className="mb-6 flex w-fit items-center gap-3 text-primary lg:mb-10"
          aria-label="Guía bíblica, inicio"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/20">
            <Leaf size={22} strokeWidth={1.5} />
          </span>
          <span>
            <span className="block font-serif text-2xl font-semibold tracking-tight">
              Guía bíblica
            </span>
            <span className="text-[10px] uppercase tracking-[.22em]">
              Toda la Biblia · NVI
            </span>
          </span>
        </a>
        <div className="my-auto max-w-xl py-3 lg:py-14">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.22em] text-primary lg:mb-5 lg:text-xs">
            Un espacio para ti
          </p>
          <h1 className="font-serif text-[clamp(2rem,5vw,5.2rem)] leading-[1.06] tracking-[-.045em]">
            Tu historia merece
            <br />
            <span className="italic text-primary">ser escuchada.</span>
          </h1>
          <p className="mt-6 hidden max-w-md text-base leading-8 text-muted-foreground sm:block">
            Encuentra una pausa, comparte cómo te sientes y descubre palabras de
            la Biblia que acompañen tu momento.
          </p>
          <div className="mt-9 hidden max-w-md border-t border-border pt-7 sm:grid sm:grid-cols-2 sm:gap-6">
            <div>
              <LockKeyhole className="mb-3 text-primary" size={19} />
              <p className="text-sm font-semibold">Tu cuenta, tu historia</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Un historial personal al que solo accedes con tu cuenta.
              </p>
            </div>
            <div>
              <BookOpen className="mb-3 text-primary" size={19} />
              <p className="text-sm font-semibold">Una lectura con contexto</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Pasajes de los 66 libros para reflexionar sobre lo que vives.
              </p>
            </div>
          </div>
        </div>
        <p className="mt-8 hidden text-xs text-muted-foreground lg:block">
          Un momento de calma. Una conversación a la vez.
        </p>
      </section>
      <section
        className="flex items-center justify-center py-8 lg:py-0"
        aria-label="Acceso a tu cuenta"
      >
        <div className="arrive w-full max-w-[450px] rounded-[28px] border border-border/80 bg-background/85 p-6 shadow-[0_24px_80px_hsl(176_27%_18%_/.07)] sm:p-9">
          <div className="mb-7 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-primary">
            <LockKeyhole size={14} /> Tu espacio personal
          </div>
          <h2 className="font-serif text-3xl tracking-tight">
            Qué bueno verte de nuevo
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Continúa con tu cuenta de Google para guardar tus conversaciones y
            volver a ellas cuando lo necesites.
          </p>
          {configurationError ? (
            <div
              role="alert"
              className="mt-6 rounded-xl bg-secondary/60 p-4 text-sm leading-6"
            >
              <p>
                El acceso con Google aún no está disponible. Inténtalo de nuevo
                en unos momentos.
              </p>
              <Button variant="outline" onClick={retry} className="mt-4">
                Intentar de nuevo
              </Button>
            </div>
          ) : (
            <>
              {(error || oauthError) && (
                <p
                  role="alert"
                  className="mt-6 rounded-xl bg-destructive/8 p-4 text-sm leading-6 text-destructive"
                >
                  {error || oauthError}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={signIn}
                disabled={busy}
                className="mt-8 h-12 w-full gap-3 rounded-xl border-border bg-white text-[#1f1f1f] shadow-sm hover:bg-[#f8f9fa]"
                data-testid="button-google-login"
              >
                {busy ? (
                  <LoaderCircle
                    size={20}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <GoogleIcon />
                )}
                {busy ? "Conectando con Google…" : "Continuar con Google"}
              </Button>
              <p className="mt-4 text-center text-xs leading-6 text-muted-foreground">
                Elige tu cuenta de Google y comienza a tu ritmo.
              </p>
            </>
          )}
          <div className="mt-8 border-t border-border/70 pt-5">
            <p className="flex items-center justify-center gap-2 text-xs font-medium text-primary">
              <LockKeyhole size={13} /> Un historial privado para cada cuenta
            </p>
            <p className="mt-3 text-center text-[11px] leading-6 text-muted-foreground">
              Comparte solo lo que te resulte cómodo.
              <br />
              Al terminar en un dispositivo compartido, cierra tu sesión.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
