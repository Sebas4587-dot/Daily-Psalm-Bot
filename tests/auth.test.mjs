import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const { build } = require("esbuild");
async function load(path) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    banner: {
      js: `import {createRequire as __testRequire} from 'node:module'; const require = __testRequire(${JSON.stringify(new URL("../artifacts/api-server/package.json", import.meta.url).href)});`,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}
const { createAuthentication } = await load(
  "../artifacts/api-server/src/middlewares/auth.ts",
);
const { authConfiguration } = await load(
  "../artifacts/api-server/src/lib/supabase-auth.ts",
);
const { oauthDestinations, continueWithGoogle, oauthErrorMessage } = await load(
  "../artifacts/psalm-chatbot/src/lib/google-auth.ts",
);
async function request(
  middleware,
  { token, cookie, origin, method = "GET" } = {},
) {
  const headers = {
    authorization: token ? `Bearer ${token}` : undefined,
    host: "localhost:8080",
    origin,
    cookie,
  };
  const req = { method, get: (name) => headers[name.toLowerCase()] };
  const res = {
    locals: {},
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(status) {
      this.statusCode = status;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  let passed = false;
  await middleware(req, res, () => {
    passed = true;
  });
  return { ...res, passed };
}

test("requires verified identity and rejects anonymous cookies and forged tokens", async () => {
  let calls = 0;
  const auth = createAuthentication(
    async (token) => {
      calls++;
      return token === "valid-token" ? "verified-user-uuid" : null;
    },
    () => true,
  );
  for (const options of [
    {},
    { cookie: `bibleguide_session=${"a".repeat(64)}` },
  ]) {
    const response = await request(auth, options);
    assert.equal(response.statusCode, 401);
    assert.equal(response.passed, false);
  }
  assert.equal(calls, 0);
  assert.equal(
    (await request(auth, { token: "forged-token" })).statusCode,
    401,
  );
  const response = await request(auth, { token: "valid-token" });
  assert.equal(response.passed, true);
  assert.equal(response.locals.userId, "verified-user-uuid");
  assert.equal(response.locals.sessionId, undefined);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers.Vary, "Authorization");
});

test("fails closed when Auth is unconfigured or unavailable and rejects foreign origins", async () => {
  const unconfigured = createAuthentication(
    async () => {
      throw new Error("Must not call");
    },
    () => false,
  );
  assert.equal(
    (await request(unconfigured, { token: "valid-token" })).statusCode,
    503,
  );
  const unavailable = createAuthentication(
    async () => {
      throw new Error("Network failed");
    },
    () => true,
  );
  assert.equal(
    (await request(unavailable, { token: "valid-token" })).statusCode,
    503,
  );
  const foreign = await request(unavailable, {
    token: "valid-token",
    method: "POST",
    origin: "https://other.example",
  });
  assert.equal(foreign.statusCode, 403);
  assert.equal(foreign.passed, false);
});

test("public configuration never exposes a service_role or secret key", () => {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.APP_ORIGIN;
    delete process.env.SUPABASE_ANON_KEY;
    for (const key of [
      "sb_secret_never_expose",
      `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`,
      "invalid",
    ]) {
      process.env.SUPABASE_PUBLISHABLE_KEY = key;
      assert.deepEqual(authConfiguration(), {
        configured: false,
        url: "",
        publishableKey: "",
        appOrigin: "",
      });
    }
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_public";
    assert.equal(authConfiguration().publishableKey, "sb_publishable_public");
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    process.env.SUPABASE_ANON_KEY = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    assert.equal(authConfiguration().configured, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Google redirects use the local origin or canonical APP_ORIGIN, including base paths", async () => {
  assert.equal(
    oauthDestinations("", "http://127.0.0.1:20874", "/").callback,
    "http://127.0.0.1:20874/auth/callback",
  );
  assert.equal(
    oauthDestinations(
      "https://guia.example",
      "http://127.0.0.1:20874",
      "/camino/",
    ).callback,
    "https://guia.example/camino/auth/callback",
  );
  const calls = [];
  const navigations = [];
  const client = {
    signInWithOAuth: async (options) => {
      calls.push(options);
      return { error: null };
    },
  };
  await continueWithGoogle(
    client,
    { appOrigin: "" },
    "http://127.0.0.1:20874",
    "/",
    (url) => navigations.push(url),
  );
  assert.deepEqual(calls, [
    {
      provider: "google",
      options: {
        redirectTo: "http://127.0.0.1:20874/auth/callback",
        queryParams: { prompt: "select_account" },
      },
    },
  ]);
  await continueWithGoogle(
    client,
    { appOrigin: "https://guia.example" },
    "http://127.0.0.1:20874",
    "/",
    (url) => navigations.push(url),
  );
  assert.equal(
    calls.length,
    1,
    "Generate PKCE only on the canonical origin, where its verifier will be available",
  );
  assert.deepEqual(navigations, ["https://guia.example/login"]);
  await continueWithGoogle(
    client,
    { appOrigin: "https://guia.example" },
    "https://guia.example",
    "/",
    () => {},
  );
  assert.equal(
    calls[1].options.redirectTo,
    "https://guia.example/auth/callback",
  );
  await assert.rejects(
    continueWithGoogle(
      {
        signInWithOAuth: async () => ({ error: new Error("Provider failed") }),
      },
      { appOrigin: "" },
      "http://127.0.0.1:20874",
      "/",
      () => {},
    ),
  );
  assert.match(oauthErrorMessage("access_denied"), /Cancelaste/);
  assert.doesNotMatch(
    oauthErrorMessage("sensitive-provider-payload"),
    /sensitive-provider-payload/,
  );
});

test("configuration rejects unsafe origins and normalizes a production APP_ORIGIN", () => {
  const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "APP_ORIGIN"];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co/";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_public";
    process.env.APP_ORIGIN = "https://guia.example/";
    assert.equal(authConfiguration().appOrigin, "https://guia.example");
    for (const origin of [
      "javascript:alert(1)",
      "https://user:password@guia.example",
      "https://guia.example/other",
      "https://guia.example?token=secret",
      "http://public.example",
    ]) {
      process.env.APP_ORIGIN = origin;
      assert.equal(authConfiguration().configured, false);
      assert.equal(authConfiguration().appOrigin, "");
    }
    process.env.APP_ORIGIN = "http://127.0.0.1:20874";
    assert.equal(authConfiguration().configured, true);
    process.env.SUPABASE_URL = "https://user:secret@example.supabase.co";
    assert.equal(authConfiguration().configured, false);
    assert.equal(authConfiguration().url, "");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
