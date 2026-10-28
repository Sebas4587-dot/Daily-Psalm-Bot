import { AuthClient } from "@supabase/auth-js";

// Only public credentials may be returned to the browser.
export function authConfiguration() {
  let url = "";
  let appOrigin = "";
  let validOrigins = true;
  try {
    const project = new URL(process.env.SUPABASE_URL?.trim() ?? "");
    if (
      project.protocol !== "https:" ||
      project.username ||
      project.password ||
      project.search ||
      project.hash ||
      project.pathname !== "/"
    )
      throw new Error();
    url = project.origin;
    if (process.env.APP_ORIGIN?.trim()) {
      const app = new URL(process.env.APP_ORIGIN.trim());
      const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
        app.hostname,
      );
      if (
        (app.protocol !== "https:" &&
          !(app.protocol === "http:" && loopback)) ||
        app.username ||
        app.password ||
        app.search ||
        app.hash ||
        app.pathname !== "/"
      )
        throw new Error();
      appOrigin = app.origin;
    }
  } catch {
    validOrigins = false;
  }
  const key =
    (
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
    )?.trim() ?? "";
  let publicKey = key.startsWith("sb_publishable_");
  if (!publicKey && key.split(".").length === 3) {
    try {
      publicKey =
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role === "anon";
    } catch {
      /* Invalid key. */
    }
  }
  const configured = validOrigins && publicKey;
  return {
    configured,
    url: configured ? url : "",
    publishableKey: configured ? key : "",
    appOrigin: configured ? appOrigin : "",
  };
}

let client: InstanceType<typeof AuthClient> | undefined;
let signature = "";
export async function verifyAccessToken(token: string): Promise<string | null> {
  const config = authConfiguration();
  if (!config.configured) throw new Error("AUTH_NOT_CONFIGURED");
  if (!client || signature !== config.url + config.publishableKey) {
    client = new AuthClient({
      url: `${config.url}/auth/v1`,
      headers: { apikey: config.publishableKey },
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    });
    signature = config.url + config.publishableKey;
  }
  // getUser verifies the token with Supabase; never trust a decoded JWT or a body userId.
  const { data, error } = await client.getUser(token);
  if (error) {
    if (!error.status || error.status >= 500)
      throw new Error("AUTH_UNAVAILABLE");
    return null;
  }
  return data.user?.id ?? null;
}
