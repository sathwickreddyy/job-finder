import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../../src/db";
import { mailConnections } from "../../src/db/schema";
import { gmail } from "../../src/services/mail/providers/gmail";
import { encryptToken, decryptToken } from "../../src/services/mail/crypto";
import {
  accessTokenFor,
  disconnectConnection,
  saveConnection,
} from "../../src/services/mail/providers/connections";
import { checkConnection, checkKey } from "../../src/features/mail/check-service";
import type { MailContext } from "../../src/features/mail/context";
import type { MailConnection, ScannedMessage } from "../../src/services/mail/providers/types";
let pool: Pool;
let connection: MailConnection;
let ownedIds: string[];
const originalScan = gmail.scanMail;
const originalFolders = gmail.folders;
const originalRefresh = gmail.refreshTokens;
const context: MailContext = {
  baselineAt: "2026-09-01T00:00:00Z",
  companies: [],
  applications: [],
  outbound: [],
};
let previousKey: string | undefined;
let triggerName: string | undefined;
let triggerTable = "settings";
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Requires isolated jobops_e2e.");
  const marker = await pool.query("select value from settings where key='__jobops_e2e'");
  if (marker.rows[0]?.value?.ownedBy !== "jobops-browser-tests")
    throw new Error("Requires ownership marker.");
}
async function current() {
  return (await db.select().from(mailConnections).where(eq(mailConnections.id, connection.id)))[0];
}
async function checkpoint() {
  return (await pool.query("select value from settings where key=$1", [checkKey(connection.id)]))
    .rows[0]?.value;
}
// Kept without company context: an explicit update about the user's own application.
function message(suffix: string): ScannedMessage {
  return {
    externalId: suffix,
    sender: "careers@example.invalid",
    subject: "We received your application",
    bodyText: "Thank you for applying to the Software Engineer role.",
    receivedAt: "2026-10-01T10:00:00Z",
    folders: ["Inbox"],
  };
}
function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function lockWait() {
  await expect
    .poll(async () =>
      Number(
        (
          await pool.query(
            "select count(*)::int as count from pg_locks where locktype='advisory' and not granted",
          )
        ).rows[0].count,
      ),
    )
    .toBeGreaterThan(0);
}
test.beforeEach(async () => {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Refusing non-test database.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await guard();
  triggerTable = "settings";
  gmail.folders = async () => [];
  previousKey = process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  process.env.MAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
  const id = randomUUID();
  ownedIds = [id];
  [connection] = await db
    .insert(mailConnections)
    .values({
      id,
      provider: "GMAIL",
      email: `${id}@example.invalid`,
      encryptedAccessToken: encryptToken("access"),
      encryptedRefreshToken: encryptToken("refresh"),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
      lastSyncedAt: new Date("2026-09-01T00:00:00Z"),
    })
    .returning();
});
test.afterEach(async () => {
  gmail.scanMail = originalScan;
  gmail.folders = originalFolders;
  gmail.refreshTokens = originalRefresh;
  await guard();
  if (triggerName) {
    await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON ${triggerTable}`);
    await pool.query(`DROP FUNCTION IF EXISTS "${triggerName}"()`);
    triggerName = undefined;
  }
  await pool.query("DELETE FROM mail_tracking WHERE account_email=$1", [connection.email]);
  const messages = await pool.query("SELECT id FROM mail_messages WHERE account_email=$1", [
    connection.email,
  ]);
  const logs = await pool.query("SELECT id FROM activity_logs WHERE metadata->>'accountEmail'=$1", [
    connection.email,
  ]);
  await pool.query("DELETE FROM mail_messages WHERE id=ANY($1::uuid[])", [
    messages.rows.map((row) => row.id),
  ]);
  await pool.query("DELETE FROM activity_logs WHERE id=ANY($1::uuid[])", [
    logs.rows.map((row) => row.id),
  ]);
  for (const id of ownedIds)
    await pool.query("DELETE FROM settings WHERE key LIKE $1", [`%${id}%`]);
  await pool.query("DELETE FROM mail_connections WHERE id=ANY($1::uuid[])", [ownedIds]);
  await closeDatabase();
  await pool.end();
  if (previousKey === undefined) delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.MAIL_TOKEN_ENCRYPTION_KEY = previousKey;
});
test("a failed checkpoint rolls back the same page's import, ledger and events", async () => {
  triggerName = `task15_${randomUUID().replaceAll("-", "")}`;
  await guard();
  await pool.query(
    `CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key = '${checkKey(connection.id)}' THEN RAISE EXCEPTION 'checkpoint rejected'; END IF; RETURN NEW; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER "${triggerName}" BEFORE INSERT OR UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION "${triggerName}"()`,
  );
  gmail.scanMail = async () => ({ messages: [message("rollback")], next: "next" });
  expect(await checkConnection(connection, context)).toMatchObject({
    status: "failed",
    newAttention: 0,
  });
  for (const table of ["mail_messages", "mail_tracking"])
    expect(
      (await pool.query(`select id from ${table} where account_email=$1`, [connection.email])).rows,
    ).toEqual([]);
  expect(await checkpoint()).toBeUndefined();
  expect((await current()).lastSyncedAt).toEqual(connection.lastSyncedAt);
});
test("serializes concurrent checks of one inbox across database sessions", async () => {
  const entered = barrier(),
    release = barrier();
  let calls = 0;
  const seen: (string | undefined)[] = [];
  gmail.scanMail = async (_row, request) => {
    calls++;
    seen.push(request.next);
    if (calls === 1) {
      entered.resolve();
      await release.promise;
    }
    return { messages: [message(String(calls))], next: String(calls) };
  };
  const first = checkConnection(connection, context);
  await entered.promise;
  const second = checkConnection(connection, context);
  try {
    await lockWait();
    expect(calls).toBe(1);
  } finally {
    release.resolve();
  }
  const result = await Promise.all([first, second]);
  expect(result.map((row) => [row.status, row.newAttention])).toEqual([
    ["more", 1],
    ["more", 1],
  ]);
  expect(seen).toEqual([undefined, "1"]);
  expect((await checkpoint()).next).toBe("2");
  expect((await current()).lastSyncedAt).toEqual(connection.lastSyncedAt);
});
test("releases the lock on provider failure and a queued disconnect leaves no progress or credentials", async () => {
  const entered = barrier(),
    release = barrier();
  gmail.scanMail = async () => {
    entered.resolve();
    await release.promise;
    throw new Error("Gmail authorization expired. Reconnect Gmail.");
  };
  const check = checkConnection(connection, context);
  await entered.promise;
  const disconnect = disconnectConnection(connection.id);
  try {
    await lockWait();
  } finally {
    release.resolve();
  }
  expect(await check).toMatchObject({ status: "failed" });
  await disconnect;
  expect(await current()).toBeUndefined();
  expect(await checkpoint()).toBeUndefined();
  expect(await checkConnection(connection, context)).toMatchObject({
    status: "failed",
    error: expect.stringContaining("disconnected"),
  });
  await expect(accessTokenFor(connection)).rejects.toThrow("disconnected");
});
test("refresh token rotation is serialized, persists both tokens, and omission retains refresh token and identity", async () => {
  await db
    .update(mailConnections)
    .set({ tokenExpiresAt: new Date(0) })
    .where(eq(mailConnections.id, connection.id));
  let calls = 0;
  const entered = barrier(),
    release = barrier();
  gmail.refreshTokens = async (token) => {
    calls++;
    expect(token).toBe("refresh");
    entered.resolve();
    await release.promise;
    return {
      accessToken: "new-access",
      refreshToken: "rotated",
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  };
  const first = accessTokenFor(connection);
  await entered.promise;
  const second = accessTokenFor(connection);
  try {
    await lockWait();
  } finally {
    release.resolve();
  }
  expect(await Promise.all([first, second])).toEqual(["new-access", "new-access"]);
  expect(calls).toBe(1);
  const rotated = await current();
  expect(decryptToken(rotated.encryptedRefreshToken!)).toBe("rotated");
  expect(decryptToken(rotated.encryptedAccessToken)).toBe("new-access");
  const saved = await saveConnection("GMAIL", connection.email, {
    accessToken: "reconnected",
    refreshToken: null,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  expect(saved.id).toBe(connection.id);
  expect(saved.createdAt).toEqual(connection.createdAt);
  expect(decryptToken(saved.encryptedRefreshToken!)).toBe("rotated");
  await db
    .update(mailConnections)
    .set({ tokenExpiresAt: new Date(0) })
    .where(eq(mailConnections.id, connection.id));
  gmail.refreshTokens = async (token) => {
    expect(token).toBe("rotated");
    return {
      accessToken: "again",
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  };
  expect(await accessTokenFor(connection)).toBe("again");
  expect(decryptToken((await current()).encryptedRefreshToken!)).toBe("rotated");
});

test("committed pages survive a secondary failure while persisting error status", async () => {
  triggerName = `task15_${randomUUID().replaceAll("-", "")}`;
  triggerTable = "mail_connections";
  await guard();
  await pool.query(
    `CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${connection.id}' AND NEW.last_error IS NOT NULL THEN RAISE EXCEPTION 'status rejected'; END IF; RETURN NEW; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON mail_connections FOR EACH ROW EXECUTE FUNCTION "${triggerName}"()`,
  );
  gmail.scanMail = async (_row, request) => {
    if (request.next) throw new Error("Gmail authorization expired. Reconnect Gmail.");
    return { messages: [message("partial-status")], next: "retry" };
  };
  expect(await checkConnection(connection, context)).toMatchObject({
    status: "more",
    newAttention: 1,
  });
  expect(await checkConnection(connection, context)).toMatchObject({ status: "failed" });
  expect((await current()).lastRefreshedCount).toBe(1);
  expect((await checkpoint()).next).toBe("retry");
  // The lock is still released after both provider and status persistence errors.
  gmail.scanMail = async () => ({ messages: [] });
  expect(await checkConnection(connection, context)).toMatchObject({
    status: "done",
    newAttention: 0,
  });
});
