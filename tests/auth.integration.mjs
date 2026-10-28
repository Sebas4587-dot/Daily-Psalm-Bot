// Explicit integration check: temporary Google identities and PKCE codes; no emails or Gemini calls.
// Run after pnpm build: node --env-file=.env tests/auth.integration.mjs
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { connectionOptions } from "../lib/db/connection-options.mjs";

const dbRequire = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const apiRequire = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const { Client } = dbRequire("pg");
const { AuthClient } = apiRequire("@supabase/auth-js");
export async function createFixtures() {
  const db = new Client(connectionOptions());
  await db.connect();
  const users = [0, 1].map((i) => ({
    id: randomUUID(),
    email: `bibleguide-test-${randomUUID()}@example.invalid`,
    googleId: randomUUID(),
    name: `Prueba ${i + 1}`,
  }));
  const cleanup = async () => {
    try {
      await db.query(
        "DELETE FROM auth.flow_state WHERE user_id = ANY($1::uuid[])",
        [users.map((user) => user.id)],
      );
      await db.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [
        users.map((user) => user.id),
      ]);
    } finally {
      await db.end();
    }
  };
  try {
    for (const user of users) {
      await db.query(
        `INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
        VALUES ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,'',now(),'{"provider":"google","providers":["google"]}',$3,now(),now(),'','','','')`,
        [
          user.id,
          user.email,
          JSON.stringify({
            full_name: user.name,
            name: user.name,
            sub: user.googleId,
            email_verified: true,
          }),
        ],
      );
      await db.query(
        `INSERT INTO auth.identities (provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES ($1,$2,$3,'google',now(),now())`,
        [
          user.googleId,
          user.id,
          JSON.stringify({
            sub: user.googleId,
            email: user.email,
            email_verified: true,
          }),
        ],
      );
    }
    return { db, users, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
export async function createOAuthCode(db, user, challenge) {
  const code = randomUUID();
  await db.query(
    `INSERT INTO auth.flow_state(id,user_id,auth_code,code_challenge_method,code_challenge,provider_type,authentication_method,provider_access_token,provider_refresh_token,created_at,updated_at,auth_code_issued_at)
    VALUES ($1,$2,$3,'s256',$4,'google','oauth','','',now(),now(),now())`,
    [randomUUID(), user.id, code, challenge],
  );
  return code;
}
export async function createFixtureSession(db, user) {
  const verifier = randomBytes(32).toString("base64url");
  const code = await createOAuthCode(
    db,
    user,
    createHash("sha256").update(verifier).digest("base64url"),
  );
  const response = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=pkce`,
    {
      method: "POST",
      headers: {
        apikey:
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    },
  );
  const session = await response.json();
  assert.ok(
    response.ok,
    `Fixture PKCE exchange failed (${session.error_code ?? session.code ?? response.status}: ${session.msg ?? ""})`,
  );
  assert.equal(session.user.id, user.id);
  assert.equal(session.user.app_metadata.provider, "google");
  return session;
}
export async function startTestServer({ port, appOrigin = "" } = {}) {
  if (port === undefined) {
    const reservation = net.createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
  }
  const server = spawn(
    process.execPath,
    [
      "--import",
      new URL("./fixtures/mock-gemini.mjs", import.meta.url).href,
      "artifacts/api-server/dist/index.mjs",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        LOG_LEVEL: "silent",
        APP_ORIGIN: appOrigin,
        GEMINI_API_KEY: "integration-test-key",
        BIBLE_API_KEY: "",
        BIBLE_ID_NVI: "",
      },
      stdio: "ignore",
    },
  );
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("Test server exited before becoming ready");
    if (
      await fetch(`${base}/api/healthz`)
        .then((response) => response.ok)
        .catch(() => false)
    )
      return {
        base,
        stop: async () => {
          if (server.exitCode !== null || server.signalCode !== null) return;
          const stopped = once(server, "exit");
          server.kill("SIGTERM");
          await stopped;
        },
      };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill("SIGTERM");
  throw new Error("Test server did not start");
}

async function run() {
  const fixture = await createFixtures();
  let server;
  try {
    server = await startTestServer();
    // Confirm the real hosted provider starts Google OAuth and accepts our local callback.
    const challenge = randomBytes(32).toString("base64url");
    try {
      const authorize = new URL(
        `${process.env.SUPABASE_URL}/auth/v1/authorize`,
      );
      authorize.search = new URLSearchParams({
        provider: "google",
        redirect_to: "http://127.0.0.1:20874/auth/callback",
        code_challenge: challenge,
        code_challenge_method: "s256",
      }).toString();
      const response = await fetch(authorize, {
        redirect: "manual",
        headers: {
          apikey:
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            process.env.SUPABASE_ANON_KEY,
        },
      });
      assert.equal(response.status, 302, "Hosted Google OAuth must be enabled");
      assert.equal(
        new URL(response.headers.get("location")).hostname,
        "accounts.google.com",
      );
      const state = await fixture.db.query(
        "SELECT referrer FROM auth.flow_state WHERE code_challenge=$1",
        [challenge],
      );
      assert.equal(
        state.rows[0]?.referrer,
        "http://127.0.0.1:20874/auth/callback",
        "Supabase must allow the local callback URL",
      );
    } finally {
      await fixture.db.query(
        "DELETE FROM auth.flow_state WHERE code_challenge=$1 AND user_id IS NULL",
        [challenge],
      );
    }
    const auth = new AuthClient({
      url: `${process.env.SUPABASE_URL}/auth/v1`,
      headers: {
        apikey:
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
      },
      persistSession: false,
      autoRefreshToken: false,
    });
    const sessions = [];
    for (const user of fixture.users)
      sessions.push(await createFixtureSession(fixture.db, user));
    const call = (path, user = 0, method = "GET", body, extraHeaders = {}) =>
      fetch(`${server.base}/api/openai${path}`, {
        method,
        headers: {
          ...(user === null
            ? {}
            : { Authorization: `Bearer ${sessions[user].access_token}` }),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await call("/conversations", null)).status, 401);
    assert.equal(
      (
        await call("/conversations", null, "GET", undefined, {
          Cookie: `bibleguide_session=${"a".repeat(64)}`,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/conversations", null, "GET", undefined, {
          Authorization: "Bearer forged.invalid.token",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          "/conversations",
          0,
          "POST",
          { title: "Foreign origin" },
          { Origin: "https://other.example" },
        )
      ).status,
      403,
    );
    const createdResponse = await call("/conversations", 0, "POST", {
      title: "Mi historia privada",
      userId: fixture.users[1].id,
    });
    assert.equal(createdResponse.status, 201);
    const conversation = await createdResponse.json();
    const sent = await call(
      `/conversations/${conversation.id}/messages`,
      0,
      "POST",
      { content: "Me siento cansado y necesito descansar.", language: "es" },
    );
    assert.equal(sent.status, 200);
    assert.match(await sent.text(), /"done":true/);
    const restored = await (
      await call(`/conversations/${conversation.id}`)
    ).json();
    assert.deepEqual(
      restored.messages.map((message) => message.role),
      ["user", "assistant"],
    );
    assert.equal(
      JSON.parse(restored.messages[1].content).recommendations[0].book,
      "MAT",
    );
    assert.equal((await call(`/conversations/${conversation.id}`)).status, 200);
    for (const [path, method, body] of [
      [`/conversations/${conversation.id}`, "GET"],
      [`/conversations/${conversation.id}/messages`, "GET"],
      [`/conversations/${conversation.id}`, "PATCH", { title: "Stolen" }],
      [`/conversations/${conversation.id}`, "DELETE"],
      [
        `/conversations/${conversation.id}/messages`,
        "POST",
        { content: "Intrusion attempt", language: "es" },
      ],
    ]) {
      assert.equal(
        (await call(path, 1, method, body)).status,
        404,
        `${method} ${path} must reject other accounts`,
      );
    }
    assert.deepEqual(
      (
        await (
          await call(`/conversations?userId=${fixture.users[0].id}`, 1)
        ).json()
      ).conversations,
      [],
    );
    assert.equal(
      (
        await call(`/conversations/${conversation.id}`, 0, "PATCH", {
          title: "Mi historia renombrada",
        })
      ).status,
      200,
    );
    assert.equal((await call("/conversations?cursor=invalid")).status, 400);
    const stamp = new Date();
    for (let i = 0; i < 125; i++)
      await fixture.db.query(
        "INSERT INTO conversations(title,user_id,updated_at) VALUES ($1,$2,$3)",
        [`Historial ${String(i).padStart(3, "0")}`, fixture.users[0].id, stamp],
      );
    const ids = [];
    let cursor = null;
    do {
      const pageResponse = await call(
        `/conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      assert.equal(pageResponse.status, 200);
      const page = await pageResponse.json();
      ids.push(...page.conversations.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 126);
    assert.equal(
      new Set(ids).size,
      126,
      "Pagination must not lose or duplicate equal timestamps",
    );
    const search = await (await call("/conversations?q=renombrada")).json();
    assert.equal(
      (await (await call("/conversations?q=%25")).json()).conversations.length,
      0,
      "Search must treat SQL wildcard characters literally",
    );
    assert.deepEqual(
      search.conversations.map((item) => item.id),
      [conversation.id],
    );
    // Exercise actual PostgreSQL RLS as the public Data API role.
    for (let user = 0; user < 2; user++) {
      await fixture.db.query("BEGIN");
      try {
        await fixture.db.query("SET LOCAL ROLE authenticated");
        await fixture.db.query(
          "SELECT set_config('request.jwt.claim.sub',$1,true)",
          [fixture.users[user].id],
        );
        const conversations = await fixture.db.query(
          "SELECT id FROM conversations WHERE id=$1",
          [conversation.id],
        );
        const messages = await fixture.db.query(
          "SELECT id FROM messages WHERE conversation_id=$1",
          [conversation.id],
        );
        assert.equal(conversations.rowCount, user === 0 ? 1 : 0);
        assert.equal(messages.rowCount, user === 0 ? 2 : 0);
        await assert.rejects(
          fixture.db.query(
            "INSERT INTO messages(conversation_id,role,content) VALUES ($1,'assistant','forged')",
            [conversation.id],
          ),
          { code: "42501" },
        );
      } finally {
        await fixture.db.query("ROLLBACK");
      }
    }
    await fixture.db.query("BEGIN");
    try {
      await fixture.db.query("SET LOCAL ROLE anon");
      await assert.rejects(fixture.db.query("SELECT * FROM conversations"), {
        code: "42501",
      });
    } finally {
      await fixture.db.query("ROLLBACK");
    }
    assert.equal(
      (await call(`/conversations/${conversation.id}`, 0, "DELETE")).status,
      204,
    );
    assert.equal(
      (
        await fixture.db.query(
          "SELECT id FROM messages WHERE conversation_id=$1",
          [conversation.id],
        )
      ).rowCount,
      0,
    );
    // SDK refresh and logout really work with the configured project.
    const refresh = await auth.refreshSession({
      refresh_token: sessions[1].refresh_token,
    });
    assert.ok(!refresh.error, "Token refresh must succeed");
    assert.ok(
      !(await auth.signOut({ scope: "local" })).error,
      "Logout must succeed",
    );
    console.log(
      "PASS: Google identities with real Supabase PKCE exchange, token refresh/logout, API isolation, ownership spoofing, pagination/search, private RLS, forbidden direct writes and cascade deletion. Temporary users removed.",
    );
  } finally {
    if (server) await server.stop();
    await fixture.cleanup();
  }
}
if (
  process.argv[1]?.endsWith("/auth.integration.mjs") ||
  process.argv[1] === "tests/auth.integration.mjs"
) {
  await run();
}
