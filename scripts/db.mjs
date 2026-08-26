// Local development database runner.
//
// Starts a self-contained PostgreSQL 17 server using `embedded-postgres`, so the
// prototype needs no system-wide Postgres install. The cluster lives in
// `.pgdata/` at the project root and persists between runs.
//
// Usage:
//   npm run db          -> initialise (first run only), start, and stay running
//   npm run db:stop     -> stop a running cluster
//
// Connection string (see .env):
//   postgresql://postgres:postgres@localhost:5433/artisan_coffee

import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), ".pgdata");
const PORT = 5433;
const DB_NAME = "artisan_coffee";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  // Force UTF8 so peso signs and non-Latin1 customer names/notes are storable.
  // Without this, initdb inherits the Windows system locale (e.g. WIN1252).
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const stopRequested = process.argv.includes("--stop");

async function main() {
  if (stopRequested) {
    await pg.stop();
    console.log("Embedded PostgreSQL stopped.");
    return;
  }

  const isFirstRun = !existsSync(DATA_DIR);
  if (isFirstRun) {
    console.log("Initialising a new PostgreSQL cluster in .pgdata ...");
    await pg.initialise();
  }

  await pg.start();
  console.log(`PostgreSQL listening on localhost:${PORT}`);

  // Create the application database if it does not already exist.
  try {
    await pg.createDatabase(DB_NAME);
    console.log(`Created database "${DB_NAME}".`);
  } catch {
    console.log(`Database "${DB_NAME}" already exists.`);
  }

  console.log("\nReady. Leave this running while you use the app.");
  console.log("Press Ctrl+C to stop.\n");

  // Stop the cluster cleanly on termination.
  const shutdown = async () => {
    console.log("\nStopping PostgreSQL ...");
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive so the server stays up.
  setInterval(() => {}, 1 << 30);
}

main().catch(async (err) => {
  console.error("Database runner failed:", err);
  process.exit(1);
});
