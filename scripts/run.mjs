import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
if (existsSync(".env")) process.loadEnvFile(".env");
const command = process.argv[2];
if (!["dev", "start", "db:setup"].includes(command)) throw new Error("Use pnpm dev, pnpm start, or pnpm db:setup");
if (!process.env.DATABASE_URL?.trim()) throw new Error("Configura DATABASE_URL con la conexión PostgreSQL de Supabase en .env.");
if (command !== "db:setup" && !(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
  throw new Error("Configura GEMINI_API_KEY en .env para activar las recomendaciones bíblicas con Gemini.");
}
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform !== "win32" && child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ }
    } else child.kill("SIGTERM");
  }
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(executable, args, { stdio: "inherit", env: { ...process.env, ...env }, detached: process.platform !== "win32" });
    children.add(child);
    child.once("error", (error) => { children.delete(child); reject(error); });
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (code === 0 || stopping) resolve();
      else reject(new Error(`pnpm ${args.join(" ")} exited (${code ?? signal})`));
    });
  });
}
try {
  await run(["--filter", "@workspace/db", "run", "migrate"]);
  if (command === "dev") {
    await run(["--filter", "@workspace/api-server", "run", "build"]);
    if (!stopping) await Promise.all([
      run(["--filter", "@workspace/api-server", "run", "start"], { PORT: process.env.API_PORT ?? "8080", HOST: process.env.HOST ?? "127.0.0.1", NODE_ENV: "development" }),
      run(["--filter", "@workspace/psalm-chatbot", "run", "dev"], { PORT: process.env.WEB_PORT ?? "20874", BASE_PATH: process.env.BASE_PATH ?? "/" }),
    ]);
  } else if (command === "start" && !stopping) {
    await run(["--filter", "@workspace/api-server", "run", "start"], { PORT: process.env.PORT ?? process.env.API_PORT ?? "8080", NODE_ENV: "production" });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Startup failed");
  stop(1);
}
