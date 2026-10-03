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
import { refreshConnection, MailRefreshError } from "../../src/features/mail/refresh-service";
import type { MailConnection } from "../../src/services/mail/providers/types";
let pool: Pool;
let connection: MailConnection;
let ownedIds: string[];
const originalList = gmail.listRecruitingMail;
const originalRefresh = gmail.refreshTokens;
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
async function cursor() {
  return (
    await pool.query("select value from settings where key=$1", [`mailCursor:${connection.id}`])
  ).rows[0]?.value;
}
function message(suffix: string) {
  return {
    externalId: `${connection.id}:${suffix}`,
    sender: "recruiter@example.invalid",
    subject: "Interview invitation",
    receivedAt: "2026-10-01T10:00:00Z",
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
  gmail.listRecruitingMail = originalList;
  gmail.refreshTokens = originalRefresh;
  await guard();
  if (triggerName) {
    await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON ${triggerTable}`);
    await pool.query(`DROP FUNCTION IF EXISTS "${triggerName}"()`);
    triggerName = undefined;
  }
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
  await pool.query("DELETE FROM settings WHERE key=ANY($1::text[])", [
    ownedIds.map((id) => `mailCursor:${id}`),
  ]);
  await pool.query("DELETE FROM mail_connections WHERE id=ANY($1::uuid[])", [ownedIds]);
  await closeDatabase();
  await pool.end();
  if (previousKey === undefined) delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.MAIL_TOKEN_ENCRYPTION_KEY = previousKey;
});
test("commits each page and reports real partial arrivals; retry resumes without advancing past failure", async () => {
  const seen: (string | undefined)[] = [];
  gmail.listRecruitingMail = async (_row, next) => {
    seen.push(next?.pageToken);
    if (next?.pageToken === "second") {
      expect(
        (
          await pool.query(
            "select count(*)::int as count from mail_messages where account_email=$1",
            [connection.email],
          )
        ).rows[0].count,
      ).toBe(1);
      expect((await cursor()).pageToken).toBe("second");
      throw new Error("Gmail page two failed.");
    }
    return { messages: [message("one")], nextCursor: { pageToken: "second", query: "frozen" } };
  };
  const failure = await refreshConnection(connection).catch((error) => error);
  expect(failure).toBeInstanceOf(MailRefreshError);
  expect(failure.result).toEqual({ imported: 1, duplicates: 0, more: true });
  expect(failure.statusSaved).toBe(true);
  const partial = await current();
  expect(partial.lastSyncedAt).toEqual(connection.lastSyncedAt);
  expect(partial.lastRefreshedCount).toBe(1);
  expect(partial.lastError).toContain("page two");
  const start = (await cursor()).startedAt;
  gmail.listRecruitingMail = async (_row, next) => {
    expect(next?.pageToken).toBe("second");
    return { messages: [message("two")] };
  };
  expect(await refreshConnection(connection)).toEqual({ imported: 1, duplicates: 0, more: false });
  expect(await cursor()).toBeUndefined();
  expect((await current()).lastSyncedAt?.toISOString()).toBe(start);
  expect((await current()).lastError).toBeNull();
  expect(seen).toEqual([undefined, "second"]);
});
test("a failed cursor checkpoint rolls back the same page's actual import/events/logs", async () => {
  triggerName = `task15_${randomUUID().replaceAll("-", "")}`;
  await guard();
  await pool.query(
    `CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key = 'mailCursor:${connection.id}' THEN RAISE EXCEPTION 'checkpoint rejected'; END IF; RETURN NEW; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER "${triggerName}" BEFORE INSERT OR UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION "${triggerName}"()`,
  );
  gmail.listRecruitingMail = async () => ({
    messages: [message("rollback")],
    nextCursor: { pageToken: "next" },
  });
  const failure = await refreshConnection(connection).catch((error) => error);
  expect(failure.result.imported).toBe(0);
  expect(
    (await pool.query("select id from mail_messages where account_email=$1", [connection.email]))
      .rows,
  ).toEqual([]);
  expect(
    (
      await pool.query("select id from activity_logs where metadata->>'accountEmail'=$1", [
        connection.email,
      ])
    ).rows,
  ).toEqual([]);
  expect(await cursor()).toBeUndefined();
  expect((await current()).lastSyncedAt).toEqual(connection.lastSyncedAt);
});
test("bounds to four pages and serializes concurrent refreshes across database sessions", async () => {
  const entered = barrier(),
    release = barrier();
  let calls = 0;
  const seen: (string | undefined)[] = [];
  gmail.listRecruitingMail = async (_row, next) => {
    calls++;
    seen.push(next?.pageToken);
    if (calls === 1) {
      entered.resolve();
      await release.promise;
    }
    return {
      messages: [message(String(calls))],
      nextCursor: { pageToken: String(calls), query: "frozen" },
    };
  };
  const first = refreshConnection(connection);
  await entered.promise;
  const second = refreshConnection(connection);
  try {
    await lockWait();
    expect(calls).toBe(1);
  } finally {
    release.resolve();
  }
  const result = await Promise.all([first, second]);
  expect(result.map((row) => row.imported)).toEqual([4, 4]);
  expect(calls).toBe(8);
  expect(seen).toEqual([undefined, "1", "2", "3", "4", "5", "6", "7"]);
  expect((await cursor()).pageToken).toBe("8");
  expect((await current()).lastSyncedAt).toEqual(connection.lastSyncedAt);
});
test("releases lock on provider failure and a queued disconnect cannot resurrect cursor or credentials", async () => {
  const entered = barrier(),
    release = barrier();
  gmail.listRecruitingMail = async () => {
    entered.resolve();
    await release.promise;
    throw new Error("Gmail authorization expired. Reconnect Gmail.");
  };
  const refresh = refreshConnection(connection).catch((error) => error);
  await entered.promise;
  const disconnect = disconnectConnection(connection.id);
  try {
    await lockWait();
  } finally {
    release.resolve();
  }
  expect(await refresh).toBeInstanceOf(MailRefreshError);
  await disconnect;
  expect(await current()).toBeUndefined();
  expect(await cursor()).toBeUndefined();
  await expect(refreshConnection(connection)).rejects.toThrow("disconnected");
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

test("partial arrivals survive a secondary failure while persisting error status", async () => {
  triggerName = `task15_${randomUUID().replaceAll("-", "")}`;
  triggerTable = "mail_connections";
  await guard();
  await pool.query(
    `CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${connection.id}' AND NEW.last_error IS NOT NULL THEN RAISE EXCEPTION 'status rejected'; END IF; RETURN NEW; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON mail_connections FOR EACH ROW EXECUTE FUNCTION "${triggerName}"()`,
  );
  gmail.listRecruitingMail = async (_row, next) => {
    if (next) throw new Error("Gmail authorization expired. Reconnect Gmail.");
    return { messages: [message("partial-status")], nextCursor: { pageToken: "retry" } };
  };
  const failure = await refreshConnection(connection).catch((error) => error);
  expect(failure).toBeInstanceOf(MailRefreshError);
  expect(failure.result).toEqual({ imported: 1, duplicates: 0, more: true });
  expect(failure.statusSaved).toBe(false);
  expect((await current()).lastRefreshedCount).toBe(1);
  expect((await cursor()).pageToken).toBe("retry");
  // Release is still guaranteed after both provider and status persistence errors.
  gmail.listRecruitingMail = async () => ({ messages: [] });
  expect(await refreshConnection(connection)).toEqual({ imported: 0, duplicates: 0, more: false });
});
