import express, { type Express, type ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "16kb" }));

app.use("/api", router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found" }); });

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../psalm-chatbot/dist/public");
if (existsSync(path.join(publicDir, "index.html"))) {
  app.use(express.static(publicDir));
  app.get("/{*path}", (_req, res) => { res.sendFile(path.join(publicDir, "index.html")); });
}
const errors: ErrorRequestHandler = (err, req, res, _next) => {
  req.log.error({ error: err.name ?? "Error", code: err.code }, "Request failed");
  const status = err.status === 413 ? 413 : err instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : "Invalid request body" });
};
app.use(errors);

export default app;
