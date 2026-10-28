// Public policy and contact route, using the compiled UI and real Express route.
// No .env, Supabase, Gemini or Google requests are needed.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import privacyRouter, { apiRequire } from "./fixtures/privacy-router.mjs";

const express = apiRequire("express");
const app = express();
let authRequests = 0;
app.use("/api/privacy", privacyRouter);
app.get("/api/auth/configuration", (_req, res) => {
  authRequests++;
  res.json({ configured: false, url: "", publishableKey: "", appOrigin: "" });
});
const publicDir = fileURLToPath(
  new URL("../artifacts/psalm-chatbot/dist/public/", import.meta.url),
);
assert.ok(existsSync(`${publicDir}index.html`), "Run pnpm build first");
app.use(express.static(publicDir));
app.get("/{*path}", (_req, res) => res.sendFile(`${publicDir}index.html`));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const previousContact = process.env.CONTACT_EMAIL;
let browser;
try {
  process.env.CONTACT_EMAIL = "privacy-fixture@example.invalid"; // Test-only, never a product default.
  const response = await fetch(`${base}/api/privacy/configuration`, {
    headers: { Authorization: "Bearer invalid" },
  });
  assert.equal(
    response.status,
    200,
    "Contact is public even with no valid session",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    contactEmail: process.env.CONTACT_EMAIL,
  });

  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_EXECUTABLE_PATH ||
      ["/bin/google-chrome", "/usr/bin/google-chrome"].find(existsSync),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    locale: "es-CR",
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  // The policy must work offline from all external services, including Auth.
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/privacidad`, { waitUntil: "networkidle" });
  await page
    .getByRole("heading", {
      level: 1,
      name: "Política de privacidad",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("link", { name: process.env.CONTACT_EMAIL, exact: true })
    .waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "es");
  assert.equal(
    await page
      .getByRole("link", { name: process.env.CONTACT_EMAIL, exact: true })
      .getAttribute("href"),
    `mailto:${process.env.CONTACT_EMAIL}`,
  );
  assert.match(await page.locator("article").innerText(), /Supabase Auth/);
  assert.match(await page.locator("article").innerText(), /personas revisoras/);
  assert.match(
    await page.locator("article").innerText(),
    /No vendemos tus datos/,
  );
  assert.match(
    await page.locator("article").innerText(),
    /servicios de emergencia locales/,
  );
  assert.equal(await page.getByTestId("input-message").count(), 0);
  assert.equal(await page.getByTestId("button-google-login").count(), 0);
  assert.equal(
    authRequests,
    0,
    "A public visit must not initialize Google Auth",
  );
  assert.equal(
    await page.evaluate(() => localStorage.length),
    0,
    "Public visitors need no stored session or preferences",
  );
  mkdirSync(".local", { recursive: true });
  await page.screenshot({
    path: ".local/privacy-desktop.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("link", { name: "English", exact: true }).click();
  await page
    .getByRole("heading", { level: 1, name: "Privacy policy", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.get("lang"), "en");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const english = await page.locator("article").innerText();
  for (const text of [
    "Supabase Auth",
    "Google Gemini",
    "human reviewers",
    "We do not sell",
    "delete any conversation",
    "professional advice",
    "local emergency services",
    "trusted person",
  ])
    assert.ok(english.includes(text), `Missing English disclosure: ${text}`);
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("heading", { level: 1, name: "Privacy policy", exact: true })
    .waitFor();
  assert.equal(authRequests, 0);

  delete process.env.CONTACT_EMAIL;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/privacidad?lang=es`, { waitUntil: "networkidle" });
  await page
    .getByText("El correo de contacto todavía no está configurado.", {
      exact: false,
    })
    .waitFor();
  assert.equal(
    await page.locator('a[href^="mailto:"]').count(),
    0,
    "Never invent a contact address",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No horizontal overflow on mobile",
  );
  await page.screenshot({
    path: ".local/privacy-mobile.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.route("**/api/privacy/configuration", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByText("No pudimos cargar el correo de contacto.", { exact: false })
    .waitFor();
  await page
    .getByRole("heading", {
      level: 1,
      name: "Política de privacidad",
      exact: true,
    })
    .waitFor();
  assert.equal(authRequests, 0);
  await page.unroute("**/api/privacy/configuration");

  await page
    .getByRole("link", { name: "Volver a la app", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "El acceso con Google aún no está disponible" })
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
  const afterLogin = authRequests;
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    authRequests,
    afterLogin,
    "Public policy stays accessible with Auth unconfigured",
  );
  assert.deepEqual(errors, []);
} finally {
  if (previousContact === undefined) delete process.env.CONTACT_EMAIL;
  else process.env.CONTACT_EMAIL = previousContact;
  if (browser) await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(
  "PASS: Public privacy policy in Spanish/English, no login or external services, real public contact API, missing/unavailable contact, login link and mobile layout.",
);
