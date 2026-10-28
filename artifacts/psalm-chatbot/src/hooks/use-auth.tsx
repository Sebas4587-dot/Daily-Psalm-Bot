import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AuthClient, type Session, type GoTrueClient } from "@supabase/auth-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  continueWithGoogle,
  oauthDestinations,
  oauthErrorMessage,
  type AuthConfiguration,
} from "@/lib/google-auth";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  oauthError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  retry: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<GoTrueClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queryClient = useQueryClient();
  const currentUser = useRef<string | null>(null);
  const clientRef = useRef<{ client: GoTrueClient; signature: string } | null>(
    null,
  );
  const configuration = useRef<AuthConfiguration | null>(null);
  const exchange = useRef<{
    code: string;
    result: ReturnType<GoTrueClient["exchangeCodeForSession"]>;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    let initializing = true;
    let unsubscribe: (() => void) | undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await fetch("/api/auth/configuration", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("AUTH_CONFIGURATION_UNAVAILABLE");
        const config: AuthConfiguration = await response.json();
        if (!config.configured) throw new Error("AUTH_NOT_CONFIGURED");
        if (!alive) return;
        configuration.current = config;
        const signature = config.url + config.publishableKey;
        if (clientRef.current?.signature !== signature) {
          clientRef.current?.client.stopAutoRefresh();
          clientRef.current = {
            signature,
            client: new AuthClient({
              url: `${config.url}/auth/v1`,
              headers: { apikey: config.publishableKey },
              storageKey: `bibleguide-auth:${new URL(config.url).hostname}`,
              persistSession: true,
              autoRefreshToken: true,
              flowType: "pkce",
              // The callback below exchanges the code once and surfaces failures.
              detectSessionInUrl: false,
            }),
          };
        }
        const supabase = clientRef.current.client;
        setClient(supabase);
        const applySession = (next: Session | null) => {
          if (!alive) return;
          const nextId = next?.user.id ?? null;
          if (currentUser.current !== nextId) queryClient.clear();
          currentUser.current = nextId;
          setSession(next);
          if (!initializing) setLoading(false);
        };
        const { data } = supabase.onAuthStateChange((_event, next) =>
          applySession(next),
        );
        unsubscribe = () => data.subscription.unsubscribe();
        const callback = new URL(location.href);
        const callbackPath = new URL(
          oauthDestinations("", location.origin, import.meta.env.BASE_URL)
            .callback,
        ).pathname;
        if (callback.pathname === callbackPath) {
          const fragment = new URLSearchParams(callback.hash.slice(1));
          const code = callback.searchParams.get("code");
          const providerError =
            callback.searchParams.get("error") ?? fragment.get("error");
          try {
            if (providerError) {
              setOAuthError(oauthErrorMessage(providerError));
              applySession(null);
            } else if (code) {
              if (exchange.current?.code !== code)
                exchange.current = {
                  code,
                  result: supabase.exchangeCodeForSession(code),
                };
              const result = await exchange.current.result;
              if (!alive) return;
              if (result.error || !result.data.session) {
                setOAuthError(oauthErrorMessage());
                applySession(null);
              } else {
                setOAuthError(null);
                applySession(result.data.session);
              }
            } else {
              setOAuthError(oauthErrorMessage());
              applySession(null);
            }
          } finally {
            // Do not leave OAuth codes or provider errors in URLs/referrers.
            if (alive) history.replaceState(null, "", callback.pathname);
          }
        } else {
          const result = await supabase.getSession();
          applySession(result.data.session);
        }
        initializing = false;
        if (alive) setLoading(false);
      } catch {
        if (alive && !controller.signal.aborted) {
          setError(
            "No pudimos preparar el acceso con Google. Revisa la configuración del servicio y vuelve a intentarlo.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      unsubscribe?.();
    };
  }, [attempt, queryClient]);

  const signInWithGoogle = useCallback(async () => {
    if (!client || !configuration.current)
      throw new Error("AUTH_NOT_CONFIGURED");
    setOAuthError(null);
    await continueWithGoogle(
      client,
      configuration.current,
      location.origin,
      import.meta.env.BASE_URL,
      (url) => location.assign(url),
    );
  }, [client]);
  const signOut = useCallback(async () => {
    if (!client) return;
    const { error } = await client.signOut({ scope: "local" });
    if (error) throw error;
    currentUser.current = null;
    queryClient.clear();
    setSession(null);
    setOAuthError(null);
  }, [client, queryClient]);
  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      if (!client) throw new Error("AUTH_REQUIRED");
      const expectedUser = currentUser.current;
      const { data, error } = await client.getSession();
      if (error || !data.session || data.session.user.id !== expectedUser)
        throw new Error("AUTH_REQUIRED");
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${data.session.access_token}`);
      const response = await fetch(url, {
        ...options,
        headers,
        cache: "no-store",
        credentials: "omit",
      });
      if (currentUser.current !== expectedUser)
        throw new DOMException("Account changed", "AbortError");
      if (response.status === 401) {
        currentUser.current = null;
        setSession(null);
        queryClient.clear();
        void client.signOut({ scope: "local" });
      }
      return response;
    },
    [client, queryClient],
  );
  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        error,
        oauthError,
        signInWithGoogle,
        signOut,
        apiFetch,
        retry: () => setAttempt((n) => n + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}
