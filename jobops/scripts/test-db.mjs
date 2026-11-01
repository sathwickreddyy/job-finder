import "dotenv/config";
import { spawnSync } from "node:child_process";
import pg from "pg";

// Database integration tests run only against the marked jobops_e2e database.
const source = process.env.DATABASE_URL;
if (!source)
  throw new Error("Copy .env.example to .env and start PostgreSQL before running database tests.");
const isolated = new URL(source);
isolated.pathname = "/jobops_e2e";

const admin = new URL(source);
admin.pathname = "/postgres";
const adminPool = new pg.Pool({ connectionString: admin.toString() });
const exists = await adminPool.query("select 1 from pg_database where datname = 'jobops_e2e'");
if (!exists.rowCount) await adminPool.query('create database "jobops_e2e"');
await adminPool.end();

const pool = new pg.Pool({ connectionString: isolated.toString() });
try {
  if (exists.rowCount) {
    const marker = await pool
      .query("select value from settings where key = '__jobops_e2e'")
      .catch(() => ({ rows: [] }));
    if (marker.rows[0]?.value?.ownedBy !== "jobops-browser-tests")
      throw new Error("jobops_e2e exists without the JobOps test marker. Refusing to use it.");
  }
} finally {
  await pool.end();
}

const env = { ...process.env, DATABASE_URL: isolated.toString(), MAIL_DB_TEST: "1" };
const run = (args) => spawnSync("npx", args, { stdio: "inherit", env }).status ?? 1;

if (run(["drizzle-kit", "migrate"]) !== 0) process.exit(1);
const marked = new pg.Pool({ connectionString: isolated.toString() });
await marked.query(
  "insert into settings(key,value) values ('__jobops_e2e', $1::jsonb) on conflict (key) do nothing",
  [JSON.stringify({ ownedBy: "jobops-browser-tests" })],
);
await marked.end();

const files = process.argv.slice(2);
process.exit(
  run([
    "vitest",
    "run",
    "--no-file-parallelism",
    ...(files.length ? files : [".integration.test.ts"]),
  ]),
);
