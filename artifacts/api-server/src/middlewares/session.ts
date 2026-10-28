import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";

const COOKIE_NAME = "bibleguide_session";
export const session: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (origin && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const allowedOrigin = process.env.APP_ORIGIN;
    try {
      if (allowedOrigin ? origin !== allowedOrigin : new URL(origin).host !== req.get("host")) {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
    } catch { res.status(403).json({ error: "Invalid origin" }); return; }
  }
  let token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
  }
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE === "true", maxAge: 30 * 86400000, path: "/api" });
  res.locals.sessionId = createHash("sha256").update(token).digest("hex");
  res.setHeader("Cache-Control", "no-store");
  next();
};

export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const requests = new Map<string, { count: number; expires: number }>();
  const cleanup = setInterval(() => {
    for (const [key, value] of requests) if (value.expires <= Date.now()) requests.delete(key);
  }, windowMs);
  cleanup.unref();
  return (req, res, next) => {
    const key = req.ip ?? "unknown";
    let entry = requests.get(key);
    if (!entry || entry.expires <= Date.now()) {
      if (requests.size >= 10000) { res.status(503).json({ error: "Server busy" }); return; }
      entry = { count: 0, expires: Date.now() + windowMs };
      requests.set(key, entry);
    }
    if (++entry.count > limit) {
      res.setHeader("Retry-After", Math.ceil((entry.expires - Date.now()) / 1000));
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };
}
