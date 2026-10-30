import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../../src/db";
import { mailConnections } from "../../src/db/schema";
import { encryptToken } from "../../src/services/mail/crypto";
import { checkConnection } from "../../src/features/mail/check-service";
import type { MailContext } from "../../src/features/mail/context";
import { outlook } from "../../src/services/mail/providers/outlook";
import type { MailConnection, ScannedMessage } from "../../src/services/mail/providers/types";

let pool: Pool;
let connection: MailConnection;
let messageId: string;
let previousKey: string | undefined;
const originalScan = outlook.scanMail;
const originalFolders = outlook.folders;
const context: MailContext = {
  baselineAt: "2026-10-01T00:00:00Z",
  companies: [],
  applications: [],
  outbound: [],
};

async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Requires isolated jobops_e2e.");
  const marker = await pool.query("select value from settings where key='__jobops_e2e'");
  if (marker.rows[0]?.value?.ownedBy !== "jobops-browser-tests")
    throw new Error("Requires ownership marker.");
}

test.beforeEach(async () => {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Refusing non-test database.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await guard();
  previousKey = process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  process.env.MAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
  const id = randomUUID();
  messageId = `<${id}@example.invalid>`;
  [connection] = await db
    .insert(mailConnections)
    .values({
      id,
      provider: "OUTLOOK",
      email: `${id}@example.invalid`,
      encryptedAccessToken: encryptToken("fixture-access"),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
});

test.afterEach(async () => {
  outlook.scanMail = originalScan;
  outlook.folders = originalFolders;
  await guard();
  // Capture and delete only this fixture's IDs. Cascades remove its associated events.
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
  await pool.query("DELETE FROM settings WHERE key LIKE $1", [`%${connection.id}%`]);
  await pool.query("DELETE FROM mail_connections WHERE id=$1", [connection.id]);
  await closeDatabase();
  await pool.end();
  if (previousKey === undefined) delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.MAIL_TOKEN_ENCRYPTION_KEY = previousKey;
});

for (const handled of [false, true]) {
  test(`one immutable Outlook identity survives a folder move${handled ? " and stays handled" : ""}`, async () => {
    const scanned = (folder: string): ScannedMessage => ({
      externalId: "Immutable-GraphID",
      internetMessageId: messageId,
      sender: "talent@example.invalid",
      senderName: "Talent Team",
      subject: "We received your application",
      bodyText: "Thank you for applying to the Software Engineer role.",
      receivedAt: new Date().toISOString(),
      folders: [folder],
    });
    outlook.folders = async () => [];
    outlook.scanMail = async () => ({ messages: [scanned("Inbox")] });
    expect(await checkConnection(connection, context)).toMatchObject({
      status: "done",
      newAttention: 1,
    });
    const first = await pool.query(
      "SELECT id,attention_state,folders FROM mail_messages WHERE account_email=$1",
      [connection.email],
    );
    expect(first.rows).toHaveLength(1);
    const persistedId = first.rows[0].id;
    expect(first.rows[0]).toMatchObject({ attention_state: "OPEN", folders: ["Inbox"] });
    const event = await pool.query("SELECT id FROM mail_events WHERE mail_message_id=$1", [
      persistedId,
    ]);
    expect(event.rows).toHaveLength(1);
    if (handled) {
      await guard();
      await pool.query("UPDATE mail_messages SET attention_state='DONE' WHERE id=$1", [
        persistedId,
      ]);
      await pool.query("UPDATE mail_events SET status='REVIEWED' WHERE id=$1", [event.rows[0].id]);
    }
    const [current] = await db
      .select()
      .from(mailConnections)
      .where(eq(mailConnections.id, connection.id));
    outlook.scanMail = async () => ({ messages: [scanned("Archive")] });
    expect(await checkConnection(current, context)).toMatchObject({
      status: "done",
      newAttention: 0,
    });
    const stored = await pool.query(
      "SELECT id,attention_state,folders FROM mail_messages WHERE account_email=$1",
      [connection.email],
    );
    expect(stored.rows).toEqual([
      { id: persistedId, attention_state: handled ? "DONE" : "OPEN", folders: ["Archive"] },
    ]);
    const events = await pool.query("SELECT id,status FROM mail_events WHERE mail_message_id=$1", [
      persistedId,
    ]);
    expect(events.rows).toEqual([
      { id: event.rows[0].id, status: handled ? "REVIEWED" : "NEEDS_REVIEW" },
    ]);
  });
}
