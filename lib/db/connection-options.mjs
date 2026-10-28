import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function projectRoot() {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(path.join(directory, "pnpm-workspace.yaml"))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return process.cwd();
    directory = parent;
  }
}
const root = projectRoot();
export function connectionOptions() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required");
  let url;
  try { url = new URL(process.env.DATABASE_URL); }
  catch { throw new Error("DATABASE_URL must be a PostgreSQL connection URI"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
  const options = { connectionString: url.toString(), connectionTimeoutMillis: 7000, max: 10 };
  if (url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.com")) {
    const configuredPath = process.env.DATABASE_SSL_CA_FILE || url.searchParams.get("sslrootcert");
    const caFile = configuredPath ? path.resolve(root, configuredPath) : ["prod-supabase.cer", "prod-ca-2021.crt", "supabase-ca.crt"].map((f) => path.join(root, f)).find(existsSync);
    if (!caFile || !existsSync(caFile)) {
      const error = new Error("Descarga el certificado desde Supabase > Database Settings > SSL Configuration y guárdalo en la raíz como prod-supabase.cer, o configura DATABASE_SSL_CA_FILE.");
      error.code = "SUPABASE_CA_REQUIRED";
      throw error;
    }
    // pg connection-string SSL parameters otherwise replace the verified SSL object.
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl", "uselibpqcompat"]) url.searchParams.delete(key);
    options.connectionString = url.toString();
    options.ssl = { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true, servername: url.hostname };
  }
  return options;
}
