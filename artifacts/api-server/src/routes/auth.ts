import { Router } from "express";
import { authConfiguration } from "../lib/supabase-auth";

const router = Router();
router.get("/configuration", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(authConfiguration());
});
export default router;
