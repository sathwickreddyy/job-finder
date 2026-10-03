import "dotenv/config";
import { spawn } from "node:child_process";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("Copy .env.example to .env and start PostgreSQL before running browser tests.");
const source = new URL(databaseUrl);
const testDatabase = "jobops_e2e";
if (source.pathname === `/${testDatabase}`)
  throw new Error(
    "DATABASE_URL must point to your normal JobOps database; the test runner derives its isolated database.",
  );
const admin = new URL(source);
admin.pathname = "/postgres";
const adminPool = new Pool({ connectionString: admin.toString() });
const exists = await adminPool.query("select 1 from pg_database where datname = $1", [
  testDatabase,
]);
if (!exists.rowCount) await adminPool.query('create database "jobops_e2e"');
await adminPool.end();
const isolated = new URL(source);
isolated.pathname = `/${testDatabase}`;
if (exists.rowCount) {
  const pool = new Pool({ connectionString: isolated.toString() });
  try {
    const marker = await pool.query("select value from settings where key = '__jobops_e2e'");
    if (marker.rows[0]?.value?.ownedBy !== "jobops-browser-tests")
      throw new Error(
        "jobops_e2e already exists without the JobOps test marker. Choose another test database before running tests.",
      );
  } finally {
    await pool.end();
  }
}
const environment = {
  ...process.env,
  DATABASE_URL: isolated.toString(),
  APP_URL: "http://127.0.0.1:3231",
  JOBOPS_ACCESS_TOKEN: process.env.JOBOPS_E2E_ACCESS_TOKEN ?? "",
  STORAGE_ROOT: "./data/e2e-uploads",
  JOBOPS_BUILD_DIR: ".next-e2e",
  E2E_BASE_URL: "http://127.0.0.1:3231",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GMAIL_TOKEN_ENCRYPTION_KEY: "",
};
function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: environment });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}
console.log(
  "Preparing isolated jobops_e2e database and data/e2e-uploads; your normal career data is untouched.",
);
await run("npm", ["run", "db:migrate"]);
const markerPool = new Pool({ connectionString: isolated.toString() });
await markerPool.query(
  "insert into settings(key,value) values ('__jobops_e2e', $1::jsonb) on conflict (key) do nothing",
  [JSON.stringify({ ownedBy: "jobops-browser-tests" })],
);
await markerPool.end();
await run("npm", ["run", "db:seed:test"]);
await run(process.execPath, [
  "node_modules/@playwright/test/cli.js",
  "test",
  ...process.argv.slice(2),
]);
