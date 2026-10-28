import { test } from "node:test";
import assert from "node:assert/strict";
import { privacyConfiguration } from "./fixtures/privacy-router.mjs";

test("privacy configuration exposes only a validated public contact, without credentials", () => {
  const keys = [
    "CONTACT_EMAIL",
    "GEMINI_API_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "DATABASE_URL",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of keys.slice(1)) process.env[key] = "private-test-sentinel";
    delete process.env.CONTACT_EMAIL;
    assert.deepEqual(privacyConfiguration(), { contactEmail: null });
    process.env.CONTACT_EMAIL = "  privacy+test@example.invalid  ";
    assert.deepEqual(privacyConfiguration(), {
      contactEmail: "privacy+test@example.invalid",
    });
    for (const invalid of [
      "",
      "not-an-email",
      "javascript:alert(1)",
      "mailto:privacy@example.invalid",
      "privacy@example.invalid?subject=Injected",
      "privacy@example.invalid\r\nBcc:other@example.invalid",
      "<script>alert(1)</script>@example.invalid",
      "privacy@example.invalid,other@example.invalid",
    ]) {
      process.env.CONTACT_EMAIL = invalid;
      assert.deepEqual(privacyConfiguration(), { contactEmail: null });
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
