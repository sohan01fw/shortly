import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool } from "pg";

const migrationsDirectory = path.join(import.meta.dir, "sql");

export const runMigrations = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('shortly_migrations'))",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [file],
      );

      if (applied.rowCount) {
        continue;
      }

      await client.query(
        await readFile(path.join(migrationsDirectory, file), "utf8"),
      );
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [file],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
