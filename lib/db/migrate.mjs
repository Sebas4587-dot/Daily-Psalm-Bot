import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { connectionOptions } from "./connection-options.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client(connectionOptions());
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(772401)");
  await client.query("CREATE TABLE IF NOT EXISTS psalmguide_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  await client.query("ALTER TABLE psalmguide_migrations ENABLE ROW LEVEL SECURITY");
  for (const name of (await readdir(new URL("./migrations/", import.meta.url))).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(`./migrations/${name}`, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const { rows } = await client.query("SELECT checksum FROM psalmguide_migrations WHERE name = $1", [name]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query(sql);
    await client.query("INSERT INTO psalmguide_migrations(name, checksum) VALUES ($1, $2)", [name, checksum]);
    console.log(`Applied ${name}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
