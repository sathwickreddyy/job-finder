import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { importMailRecords, mailImportSchema } from "../../src/features/mail/import";

let pool: Pool;
let client: PoolClient;
let ownedSchema: string | undefined;
async function guard() {
  const url = process.env.DATABASE_URL;
  if (!url || new URL(url).pathname !== "/jobops_e2e")
    throw new Error("Connection fixtures require the isolated jobops_e2e database.");
  const marker = await client.query("SELECT value FROM public.settings WHERE key = '__jobops_e2e'");
  if (marker.rows[0]?.value?.ownedBy !== "jobops-browser-tests")
    throw new Error("Connection fixtures require the JobOps browser-test ownership marker.");
}
async function fixture(sql: string, values?: unknown[]) {
  await guard();
  return client.query(sql, values);
}
async function migration(number: "0007" | "0008" | "0009") {
  const names = {
    "0007": "mail_connections",
    "0008": "copy_gmail_connections",
    "0009": "drop_gmail_connections",
  };
  const sql = await readFile(
    new URL(`../../drizzle/${number}_${names[number]}.sql`, import.meta.url),
    "utf8",
  );
  await guard();
  // Run every generated statement, exactly as Drizzle's breakpoint parser does.
  for (const statement of sql.split("--> statement-breakpoint"))
    if (statement.trim()) await client.query(statement);
}
async function sequence() {
  await fixture("BEGIN");
  try {
    for (const number of ["0007", "0008", "0009"] as const) await migration(number);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nullableId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const cursor = {
  pageToken: "page+/==",
  query: "after:123 -in:sent",
  startedAt: "2026-09-01T01:02:03.456Z",
  nested: { untouched: [null, 42] },
};
const tokenBytes = "v1.001122.abC+/=_é";
async function legacy() {
  await fixture(
    `INSERT INTO gmail_connections (id,email,encrypted_access_token,encrypted_refresh_token,token_expires_at,last_synced_at,created_at,updated_at)
    VALUES ($1,'one@example.invalid',$3,'refresh+/==','2026-10-03 01:02:03.123456+00','2026-09-28 10:00:00.654321+00','2026-08-01 09:10:11.222333+00','2026-09-01 12:13:14.444555+00'),
      ($2,'two@example.invalid','second-access',NULL,NULL,NULL,'2026-08-02 09:10:11.222333+00','2026-09-02 12:13:14.444555+00')`,
    [oldId, nullableId, tokenBytes],
  );
  await fixture(
    "INSERT INTO settings(key,value,updated_at) VALUES ($1,$2,'2026-09-01 01:02:03.456789+00'), ('gmailCursor:orphan', '{\"legitimate\":true}', '2026-08-01 00:00:00+00'), ('mailCursor:untouched', '{\"existing\":true}', '2026-08-01 00:00:00+00')",
    [`gmailCursor:${oldId}`, cursor],
  );
}
async function rows(table: string) {
  // Comparison retains Postgres microseconds and token UTF-8 bytes, beyond JS Date precision.
  return (
    await client.query(`SELECT id::text,email,encode(convert_to(encrypted_access_token,'UTF8'),'hex') AS access,
    encrypted_refresh_token,token_expires_at::text,last_synced_at::text,created_at::text,updated_at::text FROM ${table} ORDER BY id`)
  ).rows;
}
async function cursors() {
  return (await client.query("SELECT key,value,updated_at::text FROM settings ORDER BY key")).rows;
}
test.beforeEach(async () => {
  ownedSchema = undefined;
  const url = process.env.DATABASE_URL;
  if (!url || new URL(url).pathname !== "/jobops_e2e")
    throw new Error("Connection tests refuse all databases except jobops_e2e.");
  pool = new Pool({ connectionString: url, max: 1 });
  client = await pool.connect();
  await guard();
  const name = `task14_${randomUUID().replaceAll("-", "")}`;
  await fixture(`CREATE SCHEMA "${name}"`);
  ownedSchema = name;
  await fixture(`SET search_path TO "${name}", public`);
  const initial = await readFile(
    new URL("../../drizzle/0000_easy_madrox.sql", import.meta.url),
    "utf8",
  );
  const oldTable = initial.match(/CREATE TABLE "gmail_connections" \([\s\S]*?\n\);/)?.[0];
  if (!oldTable) throw new Error("Legacy generated Gmail DDL missing.");
  await fixture(oldTable);
  await fixture(
    'CREATE UNIQUE INDEX "gmail_connections_email_idx" ON "gmail_connections" ("email")',
  );
  await fixture(
    "CREATE TABLE settings (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now())",
  );
  await fixture("CREATE TABLE mail_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid())");
  await legacy();
});
test.afterEach(async () => {
  if (client) {
    await client.query("ROLLBACK");
    if (ownedSchema) {
      await guard();
      // Only the captured schema created by this test is ever removed.
      if (!/^task14_[a-f0-9]{32}$/.test(ownedSchema)) throw new Error("Unsafe test schema.");
      await client.query(`DROP SCHEMA "${ownedSchema}" CASCADE`);
    }
    client.release();
  }
  await pool?.end();
});

test("full generated sequence preserves every legacy field, encrypted byte, nullable value and cursor", async () => {
  const before = await rows("gmail_connections");
  const beforeCursors = await cursors();
  await sequence();
  expect(await rows("mail_connections")).toEqual(before);
  expect(
    (
      await client.query(
        "SELECT provider,last_refreshed_at,last_refreshed_count,last_error FROM mail_connections",
      )
    ).rows,
  ).toEqual([
    { provider: "GMAIL", last_refreshed_at: null, last_refreshed_count: null, last_error: null },
    { provider: "GMAIL", last_refreshed_at: null, last_refreshed_count: null, last_error: null },
  ]);
  const expected = beforeCursors
    .map((row) => ({ ...row, key: row.key.replace(/^gmailCursor:/, "mailCursor:") }))
    .sort((a, b) => a.key.localeCompare(b.key));
  expect(await cursors()).toEqual(expected);
  expect(
    (await client.query("SELECT to_regclass($1) AS old", [`${ownedSchema}.gmail_connections`]))
      .rows[0].old,
  ).toBeNull();
  expect(
    (
      await client.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema=$1 AND table_name='mail_messages' AND column_name='account_email'",
        [ownedSchema],
      )
    ).rows,
  ).toEqual([{ is_nullable: "YES" }]);
});

for (const collision of ["id", "email", "token", "expiry", "cursor"] as const) {
  test(`a conflicting ${collision} aborts copy and rolls back the entire generated sequence`, async () => {
    const before = await rows("gmail_connections");
    await fixture("BEGIN");
    try {
      await migration("0007");
      if (collision === "cursor") {
        await fixture("INSERT INTO settings(key,value) VALUES ($1, '{\"different\":true}')", [
          `mailCursor:${oldId}`,
        ]);
      } else {
        await fixture(
          `INSERT INTO mail_connections(id,provider,email,encrypted_access_token,encrypted_refresh_token,token_expires_at,last_synced_at,created_at,updated_at)
          SELECT id,'GMAIL',email,encrypted_access_token,encrypted_refresh_token,token_expires_at,last_synced_at,created_at,updated_at
          FROM gmail_connections WHERE id=$1`,
          [oldId],
        );
        if (collision === "id")
          await fixture("UPDATE mail_connections SET provider='OUTLOOK' WHERE id=$1", [oldId]);
        if (collision === "email")
          await fixture("UPDATE mail_connections SET id=$1 WHERE id=$2", [randomUUID(), oldId]);
        if (collision === "token")
          await fixture(
            "UPDATE mail_connections SET encrypted_access_token='different' WHERE id=$1",
            [oldId],
          );
        if (collision === "expiry")
          await fixture("UPDATE mail_connections SET token_expires_at=NULL WHERE id=$1", [oldId]);
      }
      await expect(migration("0008")).rejects.toThrow(/conflicts/);
    } finally {
      await client.query("ROLLBACK");
    }
    expect(await rows("gmail_connections")).toEqual(before);
    expect(
      (await client.query("SELECT to_regclass($1) AS copied", [`${ownedSchema}.mail_connections`]))
        .rows[0].copied,
    ).toBeNull();
    expect((await cursors()).some((row) => row.key === `gmailCursor:${oldId}`)).toBe(true);
    expect(
      (
        await client.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='mail_messages' AND column_name='account_email'",
          [ownedSchema],
        )
      ).rowCount,
    ).toBe(0);
  });
}

test("exact previously copied rows and equal cursor JSON are idempotent and retain unrelated mail cursors", async () => {
  const before = await rows("gmail_connections");
  await migration("0007");
  await fixture(`INSERT INTO mail_connections(id,provider,email,encrypted_access_token,encrypted_refresh_token,token_expires_at,last_synced_at,created_at,updated_at)
    SELECT id,'GMAIL',email,encrypted_access_token,encrypted_refresh_token,token_expires_at,last_synced_at,created_at,updated_at FROM gmail_connections`);
  await fixture(
    "INSERT INTO settings(key,value,updated_at) SELECT replace(key,'gmailCursor:','mailCursor:'),value,updated_at FROM settings WHERE key LIKE 'gmailCursor:%'",
  );
  await migration("0008");
  await migration("0008");
  await migration("0009");
  expect(await rows("mail_connections")).toEqual(before);
  expect((await cursors()).map((row) => row.key)).toEqual([
    `mailCursor:${oldId}`,
    "mailCursor:orphan",
    "mailCursor:untouched",
  ]);
});

for (const change of ["connection", "cursor"] as const) {
  test(`drop revalidation retains the old table after a late legacy ${change} write`, async () => {
    await migration("0007");
    await migration("0008");
    if (change === "connection")
      await fixture(
        "UPDATE gmail_connections SET encrypted_refresh_token='late-write' WHERE id=$1",
        [oldId],
      );
    else
      await fixture(
        "INSERT INTO settings(key,value) VALUES ('gmailCursor:late', '{\"late\":true}')",
      );
    await expect(migration("0009")).rejects.toThrow(
      change === "connection" ? /preservation check/ : /Unmoved Gmail cursors/,
    );
    expect(
      (await client.query("SELECT count(*)::int AS count FROM gmail_connections")).rows[0].count,
    ).toBe(2);
  });
}

async function importExecutor() {
  await fixture("DROP TABLE mail_messages");
  for (const table of ["mail_messages", "mail_events", "activity_logs", "jobs", "applications"])
    await fixture(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  return drizzle(client, { schema });
}
function records(externalId: string) {
  return mailImportSchema.parse([
    {
      externalId,
      sender: "talent@example.invalid",
      subject: "Interview invitation",
      bodyText: "Your technical interview is ready.",
      receivedAt: "2026-10-03T00:00:00Z",
    },
  ]);
}
test("actual importer stores inbox provenance for Gmail/Outlook and null for JSON", async () => {
  const executor = await importExecutor();
  await guard();
  for (const provider of ["GMAIL", "OUTLOOK", "IMPORT"] as const) {
    const account = provider === "IMPORT" ? undefined : `${provider.toLowerCase()}@example.invalid`;
    expect(await importMailRecords(records(provider), provider, account, executor)).toEqual({
      imported: 1,
      duplicates: 0,
    });
  }
  expect(
    (
      await executor
        .select({
          provider: schema.mailMessages.provider,
          account: schema.mailMessages.accountEmail,
        })
        .from(schema.mailMessages)
    ).sort((a, b) => a.provider.localeCompare(b.provider)),
  ).toEqual([
    { provider: "GMAIL", account: "gmail@example.invalid" },
    { provider: "IMPORT", account: null },
    { provider: "OUTLOOK", account: "outlook@example.invalid" },
  ]);
  expect((await client.query("SELECT count(*)::int AS count FROM mail_events")).rows[0].count).toBe(
    3,
  );
});

test("actual Outlook importer deduplicates a moved message and preserves handled state and its event", async () => {
  const executor = await importExecutor();
  const messageId = "<same-internet-id@example.invalid>";
  await guard();
  await importMailRecords(records(messageId), "OUTLOOK", "one@outlook.invalid", executor);
  const [message] = await executor.select().from(schema.mailMessages);
  const [event] = await executor.select().from(schema.mailEvents);
  await fixture(
    "UPDATE mail_messages SET attention_state='DONE',processed_at='2026-10-03 01:00:00+00' WHERE id=$1",
    [message.id],
  );
  await fixture(
    "UPDATE mail_events SET status='REVIEWED', details='{\"handled\":true}' WHERE id=$1",
    [event.id],
  );
  const before = (await client.query("SELECT * FROM mail_messages")).rows;
  const beforeEvents = (await client.query("SELECT * FROM mail_events")).rows;
  const moved = records(messageId);
  moved[0].threadId = "different-graph-id-after-move";
  expect(await importMailRecords(moved, "OUTLOOK", "two@outlook.invalid", executor)).toEqual({
    imported: 0,
    duplicates: 1,
  });
  expect((await client.query("SELECT * FROM mail_messages")).rows).toEqual(before);
  expect((await client.query("SELECT * FROM mail_events")).rows).toEqual(beforeEvents);
});

test("a page import rolls back mail, events and logs with its outer cursor checkpoint", async () => {
  const executor = await importExecutor();
  await guard();
  await expect(
    executor.transaction(async (tx) => {
      await importMailRecords(records("rollback-id"), "GMAIL", "one@example.invalid", tx);
      await tx
        .insert(schema.settings)
        .values({ key: "mailCursor:rollback", value: { pageToken: "next" } });
      throw new Error("Checkpoint failed");
    }),
  ).rejects.toThrow("Checkpoint failed");
  for (const table of ["mail_messages", "mail_events", "activity_logs"])
    expect((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count).toBe(
      0,
    );
  expect(
    await executor
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "mailCursor:rollback")),
  ).toEqual([]);
});
