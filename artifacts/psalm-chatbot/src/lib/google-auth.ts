import type { GoTrueClient } from "@supabase/auth-js";

export type AuthConfiguration = {
  configured: boolean;
  url: string;
  publishableKey: string;
  appOrigin: string;
};

export function oauthDestinations(
  appOrigin: string,
  browserOrigin: string,
  basePath: string,
) {
  const origin = appOrigin || browserOrigin;
  const base = `/${basePath.replace(/^\/+|\/+$/g, "")}`.replace(/\/$/, "");
  return {
    origin,
    login: new URL(`${base}/login`, origin).href,
    callback: new URL(`${base}/auth/callback`, origin).href,
  };
}

export async function continueWithGoogle(
  client: GoTrueClient,
  config: AuthConfiguration,
  browserOrigin: string,
  basePath: string,
  navigate: (url: string) => void,
) {
  const destination = oauthDestinations(
    config.appOrigin,
    browserOrigin,
    basePath,
  );
  if (destination.origin !== browserOrigin) {
    // The PKCE verifier must be stored on the same origin as the callback.
    navigate(destination.login);
    return;
  }
  const { error } = await client.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: destination.callback,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

export function oauthErrorMessage(code?: string) {
  return code === "access_denied"
    ? "Cancelaste el acceso con Google. Puedes intentarlo de nuevo cuando quieras."
    : "No pudimos completar el acceso con Google. Vuelve a intentarlo desde este navegador.";
}
