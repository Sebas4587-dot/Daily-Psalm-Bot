import type { RequestHandler } from "express";
import { authConfiguration, verifyAccessToken } from "../lib/supabase-auth";

export function createAuthentication(
  verify = verifyAccessToken,
  configured = () => authConfiguration().configured,
): RequestHandler {
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    const origin = req.get("origin");
    if (origin && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const allowedOrigin = authConfiguration().appOrigin;
      try {
        if (
          allowedOrigin
            ? origin !== allowedOrigin
            : new URL(origin).host !== req.get("host")
        ) {
          res.status(403).json({ error: "Origin not allowed" });
          return;
        }
      } catch {
        res.status(403).json({ error: "Invalid origin" });
        return;
      }
    }
    const authorization = req.get("authorization");
    const token = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/i)?.[1];
    if (!token || token.length > 8192) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    if (!configured()) {
      res.status(503).json({ error: "AUTH_NOT_CONFIGURED" });
      return;
    }
    try {
      const userId = await verify(token);
      if (!userId) {
        res.status(401).json({ error: "AUTH_REQUIRED" });
        return;
      }
      res.locals.userId = userId;
      next();
    } catch {
      res.status(503).json({ error: "AUTH_UNAVAILABLE" });
    }
  };
}
export const authenticate = createAuthentication();

export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const requests = new Map<string, { count: number; expires: number }>();
  const cleanup = setInterval(() => {
    for (const [key, value] of requests)
      if (value.expires <= Date.now()) requests.delete(key);
  }, windowMs);
  cleanup.unref();
  return (req, res, next) => {
    const key = res.locals.userId ?? req.ip ?? "unknown";
    let entry = requests.get(key);
    if (!entry || entry.expires <= Date.now()) {
      if (requests.size >= 10000) {
        res.status(503).json({ error: "Server busy" });
        return;
      }
      entry = { count: 0, expires: Date.now() + windowMs };
      requests.set(key, entry);
    }
    if (++entry.count > limit) {
      res.setHeader(
        "Retry-After",
        Math.ceil((entry.expires - Date.now()) / 1000),
      );
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };
}
