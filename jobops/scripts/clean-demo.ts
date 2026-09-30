import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { planCleanup, tableNames, type Snapshot, type TableName } from "./demo-cleanup";
import { readBuffer, removeFile } from "../src/services/storage";

// Preview first. Applying requires the exact digest from that preview and creates
// a private record/file backup before any DELETE. This never resets a database.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const connection = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) ||
  connection.pathname !== "/jobops"
)
  throw new Error("This one-time fixture cleanup is restricted to the local jobops database.");
const applying = process.argv.includes("--apply");
const expected = process.argv.find((arg) => arg.startsWith("--expect="))?.slice(9);
if (applying && !expected)
  throw new Error("Preview first, then pass --apply --expect=<preview digest>.");
const client = new Client({ connectionString: databaseUrl });
let committed = false;
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  if (applying)
    await client.query(
      `LOCK TABLE ${tableNames.map((table) => `"${table}"`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`,
    );
  const snapshot = {} as Snapshot;
  for (const table of tableNames)
    snapshot[table] = (
      await client.query(
        `SELECT * FROM "${table}" ORDER BY "${table === "settings" ? "key" : "id"}"`,
      )
    ).rows;
  const selected = planCleanup(snapshot);
  const digest = createHash("sha256").update(JSON.stringify(selected)).digest("hex");
  const counts = Object.fromEntries(
    tableNames.map((table) => [
      table,
      { remove: selected[table].length, preserve: snapshot[table].length - selected[table].length },
    ]),
  );
  console.log(JSON.stringify({ mode: applying ? "apply" : "preview", digest, counts }, null, 2));
  if (!applying || Object.values(selected).every((rows) => !rows.length)) {
    await client.query("ROLLBACK");
  } else {
    if (expected !== digest)
      throw new Error("Fixture records changed since preview. Nothing was removed.");
    const backup = path.resolve(
      "data/backups",
      `fixture-cleanup-${new Date().toISOString().replaceAll(":", "-")}`,
    );
    await mkdir(backup, { recursive: true, mode: 0o700 });
    const fileRecords = [...selected.resume_versions, ...selected.mission_evidence].filter(
      (row) => row.storage_path,
    );
    const files = new Map<string, string>();
    for (const row of fileRecords) {
      const storagePath = String(row.storage_path);
      const bytes = await readBuffer(storagePath);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const metadata = row.metadata as Record<string, unknown> | undefined;
      const storedHash = row.sha256 ?? metadata?.sha256;
      if (storedHash && hash !== storedHash)
        throw new Error("A fixture upload changed; cleanup stopped before deletion.");
      const destination = path.join(backup, "uploads", storagePath);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
      files.set(storagePath, hash);
    }
    await writeFile(
      path.join(backup, "records.json"),
      JSON.stringify(
        { format: 1, digest, selected, snapshot, files: Object.fromEntries(files) },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    const deletionOrder: TableName[] = [
      "activity_logs",
      "mail_events",
      "mail_messages",
      "mission_evidence",
      "mission_executions",
      "mission_steps",
      "missions",
      "application_events",
      "applications",
      "job_resume_matches",
      "job_snapshots",
      "jobs",
      "resume_versions",
      "resumes",
      "profiles",
      "contacts",
      "candidate_profiles",
      "settings",
    ];
    for (const table of deletionOrder) {
      const column = table === "settings" ? "key" : "id";
      const ids = selected[table].map((row) => row[column]);
      if (!ids.length) continue;
      const result = await client.query(
        `DELETE FROM "${table}" WHERE "${column}" = ANY($1::${column === "id" ? "uuid" : "text"}[])`,
        [ids],
      );
      if (result.rowCount !== ids.length)
        throw new Error(`Unexpected deletion count for ${table}; rolling back.`);
    }
    await client.query("COMMIT");
    committed = true;
    const retainedFiles: string[] = [];
    for (const [storagePath, hash] of files) {
      // An unexpected file change after the backup preserves the live file.
      if (
        createHash("sha256")
          .update(await readBuffer(storagePath))
          .digest("hex") !== hash
      ) {
        retainedFiles.push(storagePath);
        continue;
      }
      await removeFile(storagePath);
    }
    const remaining: Record<string, number> = {};
    for (const table of tableNames)
      remaining[table] = (
        await client.query(`SELECT count(*)::int AS count FROM "${table}"`)
      ).rows[0].count;
    await writeFile(
      path.join(backup, "result.json"),
      JSON.stringify(
        {
          digest,
          counts,
          remaining,
          removedUploads: files.size - retainedFiles.length,
          retainedFiles,
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      JSON.stringify(
        { backup, removedUploads: files.size - retainedFiles.length, retainedFiles, remaining },
        null,
        2,
      ),
    );
  }
} catch (error) {
  if (!committed) await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
