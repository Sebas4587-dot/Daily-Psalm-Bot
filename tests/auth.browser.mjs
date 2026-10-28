// Browser OAuth regression check. Google consent is controlled; PKCE and API/RLS use real Supabase.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import {
  createFixtures,
  createOAuthCode,
  startTestServer,
} from "./auth.integration.mjs";

const fixture = await createFixtures();
const servers = [];
let browser;
const errors = [];
const forbidden = [];
const exchanges = new Map();
const failedRequests = [];
const projectUrl = process.env.SUPABASE_URL;
const storageKey = `bibleguide-auth:${new URL(projectUrl).hostname}`;
let selectedUser = fixture.users[0];
let outcome = "success";
let authorizations = 0;
async function instrument(context, expectedOrigin) {
  context.on("requestfailed", (request) => {
    const url = new URL(request.url());
    failedRequests.push({
      origin: url.origin,
      path: url.pathname,
      reason: request.failure()?.errorText,
    });
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== projectUrl) return;
    if (
      /\/(signup|recover|verify)$/.test(url.pathname) ||
      url.searchParams.get("grant_type") === "password"
    )
      forbidden.push(url.pathname);
    if (
      url.pathname.endsWith("/token") &&
      url.searchParams.get("grant_type") === "pkce"
    ) {
      const code = request.postDataJSON().auth_code;
      exchanges.set(code, (exchanges.get(code) ?? 0) + 1);
    }
  });
  await context.route(`${projectUrl}/auth/v1/authorize*`, async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.searchParams.get("provider"), "google");
    assert.equal(
      url.searchParams.get("redirect_to"),
      `${expectedOrigin}/auth/callback`,
    );
    assert.equal(url.searchParams.get("code_challenge_method"), "s256");
    assert.ok(url.searchParams.get("code_challenge")?.length >= 43);
    assert.equal(url.searchParams.get("code_verifier"), null);
    assert.equal(url.searchParams.get("prompt"), "select_account");
    authorizations++;
    let callback;
    if (outcome === "cancel")
      callback = `${expectedOrigin}/auth/callback?error=access_denied&error_description=PRIVATE_PROVIDER_DETAIL`;
    else {
      const code =
        outcome === "invalid"
          ? randomUUID()
          : await createOAuthCode(
              fixture.db,
              selectedUser,
              url.searchParams.get("code_challenge"),
            );
      callback = `${expectedOrigin}/auth/callback?code=${code}`;
    }
    // Use a fresh navigation so the controlled HTTPS domain is intercepted
    // again instead of relying on DNS for a synthetic redirect chain.
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<script>location.replace(${JSON.stringify(callback)})</script>`,
    });
  });
}
async function clickGoogle(page) {
  await page
    .getByRole("button", { name: "Continuar con Google", exact: true })
    .click();
}
async function waitChat(page) {
  await page.getByTestId("input-message").waitFor({ timeout: 20000 });
  assert.equal(
    new URL(page.url()).search,
    "",
    "OAuth code must be removed from the URL",
  );
  assert.equal(new URL(page.url()).hash, "");
}
try {
  const executablePath =
    process.env.CHROMIUM_EXECUTABLE_PATH ||
    ["/bin/google-chrome", "/usr/bin/google-chrome"].find((path) =>
      existsSync(path),
    );
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const local = await startTestServer({ port: 20874 });
  servers.push(local);
  const context = await browser.newContext({
    locale: "es-CR",
    viewport: { width: 1440, height: 960 },
  });
  await instrument(context, "http://127.0.0.1:20874");
  const page = await context.newPage();
  await page.goto(`${local.base}/login`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Continuar con Google", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("input").count(),
    0,
    "Email, password and registration fields must be absent",
  );
  assert.equal(
    await page
      .getByText(/Olvidé mi contraseña|Crear una cuenta|Confirma la contraseña/)
      .count(),
    0,
  );
  await page
    .getByText("Al continuar aceptas la política de privacidad", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("link", { name: "política de privacidad", exact: true })
    .click();
  await page
    .getByRole("heading", {
      level: 1,
      name: "Política de privacidad",
      exact: true,
    })
    .waitFor();
  assert.equal(authorizations, 0, "Reading the policy must not start OAuth");
  await page
    .getByRole("link", { name: "Volver a la app", exact: true })
    .click();
  await page.getByTestId("button-google-login").waitFor();
  mkdirSync(".local", { recursive: true });
  await page.screenshot({
    path: ".local/google-login-desktop.png",
    fullPage: true,
    animations: "disabled",
  });

  outcome = "cancel";
  await clickGoogle(page);
  await page
    .getByRole("alert")
    .filter({ hasText: "Cancelaste el acceso" })
    .waitFor();
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /PRIVATE_PROVIDER_DETAIL/,
  );
  assert.equal(new URL(page.url()).search, "");
  outcome = "invalid";
  await clickGoogle(page);
  await page
    .getByRole("alert")
    .filter({ hasText: "No pudimos completar el acceso" })
    .waitFor();
  outcome = "success";
  await clickGoogle(page);
  await waitChat(page);
  await page.getByText(fixture.users[0].name, { exact: true }).waitFor();
  await page
    .getByTestId("input-message")
    .fill("Necesito esperanza en este día de prueba.");
  await page.getByTestId("button-send-message").click();
  await page.getByTestId("scripture-card").first().waitFor();
  await page.getByTestId("status-streaming").waitFor({ state: "hidden" });
  const conversation = (
    await fixture.db.query("SELECT id FROM conversations WHERE user_id=$1", [
      fixture.users[0].id,
    ])
  ).rows[0];
  assert.ok(conversation);
  assert.equal(
    (
      await fixture.db.query(
        "SELECT id FROM messages WHERE conversation_id=$1",
        [conversation.id],
      )
    ).rowCount,
    2,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("scripture-card").first().waitFor();
  await page
    .locator("footer")
    .getByRole("link", { name: "Política de privacidad", exact: true })
    .click();
  await page
    .getByRole("heading", {
      level: 1,
      name: "Política de privacidad",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByTestId("scripture-card").count(),
    0,
    "Public page must not expose chat content",
  );
  assert.ok(
    await page.evaluate(
      (key) => Boolean(localStorage.getItem(key)),
      storageKey,
    ),
    "Policy navigation must preserve the signed-in session",
  );
  await page
    .getByRole("link", { name: "Volver a la app", exact: true })
    .click();
  await page.getByTestId("scripture-card").first().waitFor();
  await page.getByTestId("button-lang-en").click();
  await page
    .locator("footer")
    .getByRole("link", { name: "Privacy policy", exact: true })
    .click();
  await page
    .getByRole("heading", { level: 1, name: "Privacy policy", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Back to the app", exact: true })
    .click();
  await page.getByTestId("scripture-card").first().waitFor();
  await page.getByTestId("button-lang-es").click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar con Google", exact: true })
    .waitFor();
  assert.equal(await page.getByTestId("scripture-card").count(), 0);
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
    null,
  );

  selectedUser = fixture.users[1];
  await clickGoogle(page);
  await waitChat(page);
  await page.getByTestId("welcome-empty-state").waitFor();
  assert.equal(
    await page.getByTestId(`history-conversation-${conversation.id}`).count(),
    0,
  );
  const denied = await page.evaluate(
    async ({ key, id }) => {
      const token = JSON.parse(localStorage.getItem(key)).access_token;
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const methods = [
        ["GET", `/api/openai/conversations/${id}`],
        ["GET", `/api/openai/conversations/${id}/messages`],
        ["PATCH", `/api/openai/conversations/${id}`, { title: "Stolen" }],
        ["DELETE", `/api/openai/conversations/${id}`],
        [
          "POST",
          `/api/openai/conversations/${id}/messages`,
          { content: "Intrusion", language: "es" },
        ],
      ];
      const statuses = [];
      for (const [method, url, body] of methods)
        statuses.push(
          (
            await fetch(url, {
              method,
              headers,
              ...(body ? { body: JSON.stringify(body) } : {}),
            })
          ).status,
        );
      return statuses;
    },
    { key: storageKey, id: conversation.id },
  );
  assert.deepEqual(denied, [404, 404, 404, 404, 404]);
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar con Google", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/google-login-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  selectedUser = fixture.users[0];
  await clickGoogle(page);
  await page.getByTestId("scripture-card").first().waitFor();
  await page
    .getByRole("button", { name: "Abrir historial", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await drawer.getByTestId(`history-conversation-${conversation.id}`).waitFor();
  assert.ok(
    await drawer.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  );
  await drawer
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar con Google", exact: true })
    .waitFor();
  assert.equal(await page.getByTestId("scripture-card").count(), 0);
  await context.close();

  const productionOrigin = "https://guia.example";
  const production = await startTestServer({ appOrigin: productionOrigin });
  servers.push(production);
  const productionContext = await browser.newContext({ locale: "es-CR" });
  await productionContext.route(`${productionOrigin}/**`, async (route) => {
    const incoming = new URL(route.request().url());
    const response = await route.fetch({
      url: `${production.base}${incoming.pathname}${incoming.search}`,
    });
    await route.fulfill({ response });
  });
  await instrument(productionContext, productionOrigin);
  const productionPage = await productionContext.newPage();
  await productionPage.goto(`${production.base}/login`, {
    waitUntil: "networkidle",
  });
  const beforeCanonical = authorizations;
  await clickGoogle(productionPage);
  await productionPage.waitForURL(`${productionOrigin}/login`);
  await productionPage
    .getByRole("button", { name: "Continuar con Google", exact: true })
    .waitFor();
  assert.equal(
    authorizations,
    beforeCanonical,
    "Canonicalize before storing a PKCE verifier",
  );
  await clickGoogle(productionPage);
  await waitChat(productionPage);
  assert.equal(new URL(productionPage.url()).origin, productionOrigin);
  await productionPage
    .getByTestId(`history-conversation-${conversation.id}`)
    .waitFor();
  await productionPage
    .getByTestId(`history-conversation-${conversation.id}`)
    .click();
  await productionPage.getByTestId("scripture-card").first().waitFor();
  await productionPage
    .locator("footer")
    .getByRole("link", { name: "Política de privacidad", exact: true })
    .click();
  await productionPage
    .getByRole("heading", {
      level: 1,
      name: "Política de privacidad",
      exact: true,
    })
    .waitFor();
  assert.equal(new URL(productionPage.url()).origin, productionOrigin);
  await productionPage
    .getByRole("link", { name: "Volver a la app", exact: true })
    .click();
  await productionPage.getByTestId("scripture-card").first().waitFor();
  await productionPage
    .getByTestId("input-message")
    .fill("Quiero continuar esta reflexión desde producción.");
  await productionPage.getByTestId("button-send-message").click();
  await productionPage.getByTestId("scripture-card").nth(1).waitFor();
  await productionPage
    .getByTestId("status-streaming")
    .waitFor({ state: "hidden" });
  assert.equal(
    (
      await fixture.db.query(
        "SELECT id FROM messages WHERE conversation_id=$1",
        [conversation.id],
      )
    ).rowCount,
    4,
  );
  await productionPage
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await productionPage
    .getByRole("button", { name: "Continuar con Google", exact: true })
    .waitFor();
  assert.equal(
    await productionPage
      .getByTestId(`history-conversation-${conversation.id}`)
      .count(),
    0,
  );
  assert.ok(
    [...exchanges.values()].every((count) => count === 1),
    "Exchange each OAuth code only once",
  );
  assert.deepEqual(
    forbidden,
    [],
    "Do not call password, registration or recovery APIs",
  );
  assert.deepEqual(errors, []);
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages()) {
      const url = new URL(page.url());
      console.error(
        JSON.stringify({
          origin: url.origin,
          path: url.pathname,
          alert: await page.getByRole("alert").allTextContents(),
          status: await page.getByRole("status").allTextContents(),
          storage: await page
            .evaluate(
              (key) => ({
                session: Boolean(localStorage.getItem(key)),
                verifier: Boolean(localStorage.getItem(`${key}-code-verifier`)),
                secure: isSecureContext,
              }),
              storageKey,
            )
            .catch(() => ({ blocked: true })),
          failedRequests,
        }),
      );
    }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const server of servers) await server.stop();
  await fixture.cleanup();
}
console.log(
  "PASS: Google button, PKCE callback/error/retry, local :20874 and canonical production redirects, public privacy links in both languages, persistence, logout/account switching, private conversations and mobile layout. Temporary users removed.",
);
