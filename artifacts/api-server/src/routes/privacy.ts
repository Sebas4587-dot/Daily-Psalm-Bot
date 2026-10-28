import { Router } from "express";
import { GetPrivacyConfigurationResponse } from "@workspace/api-zod";

export function privacyConfiguration() {
  // A plain address only: never turn URLs, headers or mailto parameters into a link.
  const email = process.env.CONTACT_EMAIL?.trim() ?? null;
  const parsed =
    GetPrivacyConfigurationResponse.shape.contactEmail.safeParse(email);
  return { contactEmail: parsed.success ? parsed.data : null };
}

const router = Router();
router.get("/configuration", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(privacyConfiguration());
});
export default router;
