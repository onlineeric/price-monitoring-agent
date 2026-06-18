import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Programmatic Drizzle migrator. Applies every committed migration in
 * `packages/db/drizzle/` that has not yet been recorded in the database's
 * migration journal table, then stops.
 *
 * Two entry points share this code:
 *   - `pnpm --filter @price-monitor/db migrate` (manual / local / prod fallback)
 *   - the gated worker on startup when `RUN_MIGRATIONS=true` (auto-apply on deploy)
 *
 * The migrations folder is resolved relative to this module so it works no
 * matter what the process's cwd is (the worker runs from `apps/worker`).
 */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required to run migrations");
  }

  // A short-lived, single-connection client — we connect, migrate, disconnect.
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    console.log("[migrate] applying pending migrations…");
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("[migrate] database is up to date");
  } finally {
    await client.end();
  }
}

// When executed directly (`tsx src/migrate.ts`) run and exit with a status code.
// When imported (by the worker) this guard is false, so nothing auto-runs.
const invokedDirectly = argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  // Standalone CLI: load the monorepo root .env so DATABASE_URL is available.
  // (The worker import path relies on its own config.ts having loaded dotenv
  // first, so runMigrations itself stays env-agnostic.)
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[migrate] migration failed:", error);
      process.exit(1);
    });
}
