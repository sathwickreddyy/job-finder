import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../../src/db";
import { mailConnections } from "../../src/db/schema";
import { encryptToken } from "../../src/services/mail/crypto";
import { refreshConnection } from "../../src/features/mail/refresh-service";
import type { MailConnection } from "../../src/services/mail/providers/types";

let pool: Pool;
let connection: MailConnection;
let messageId: string;
let previousKey: string | undefined;
const originalFetch = globalThis.fetch;

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
  globalThis.fetch = originalFetch;
  await guard();
  // Capture and delete only this fixture's IDs. Cascades remove its associated events.
  const messages = await pool.query(
    "SELECT id FROM mail_messages WHERE provider='OUTLOOK' AND external_id=$1",
    [messageId],
  );
  const logs = await pool.query("SELECT id FROM activity_logs WHERE metadata->>'accountEmail'=$1", [
    connection.email,
  ]);
  await pool.query("DELETE FROM mail_messages WHERE id=ANY($1::uuid[])", [
    messages.rows.map((row) => row.id),
  ]);
  await pool.query("DELETE FROM activity_logs WHERE id=ANY($1::uuid[])", [
    logs.rows.map((row) => row.id),
  ]);
  await pool.query("DELETE FROM settings WHERE key=$1", [`mailCursor:${connection.id}`]);
  await pool.query("DELETE FROM mail_connections WHERE id=$1", [connection.id]);
  await closeDatabase();
  await pool.end();
  if (previousKey === undefined) delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.MAIL_TOKEN_ENCRYPTION_KEY = previousKey;
});

for (const handled of [false, true]) {
  test(`actual Outlook adapter and importer deduplicate folder moves${handled ? " and preserve DONE/REVIEWED" : ""}`, async () => {
    const ids = ["GraphID-before-move", "DifferentGraphID-after-move"];
    let requests = 0;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
      );
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fixture-access");
      expect(new Headers(init?.headers).get("Prefer")).toBe(
        'outlook.body-content-type="text", IdType="ImmutableId"',
      );
      expect(init?.redirect).toBe("error");
      return Response.json({
        value: [
          {
            id: ids[requests++],
            internetMessageId: messageId,
            subject: "Interview invitation for SDE-2",
            body: { contentType: "text", content: "We would like to schedule your interview." },
            bodyPreview: "Interview invitation",
            conversationId: "fixture-conversation",
            from: { emailAddress: { name: "Talent Team", address: "talent@example.invalid" } },
            toRecipients: [{ emailAddress: { address: connection.email } }],
            receivedDateTime: new Date().toISOString(),
          },
        ],
      });
    };
    expect(await refreshConnection(connection)).toEqual({
      imported: 1,
      duplicates: 0,
      more: false,
    });
    const first = await pool.query(
      "SELECT id,account_email FROM mail_messages WHERE provider='OUTLOOK' AND external_id=$1",
      [messageId],
    );
    expect(first.rows).toHaveLength(1);
    const persistedId = first.rows[0].id;
    expect(first.rows[0].account_email).toBe(connection.email);
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
    expect(await refreshConnection(current)).toEqual({ imported: 0, duplicates: 1, more: false });
    const stored = await pool.query(
      "SELECT id,attention_state,account_email FROM mail_messages WHERE provider='OUTLOOK' AND external_id=$1",
      [messageId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      id: persistedId,
      account_email: connection.email,
      attention_state: handled ? "DONE" : "OPEN",
    });
    const events = await pool.query("SELECT id,status FROM mail_events WHERE mail_message_id=$1", [
      persistedId,
    ]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toMatchObject({
      id: event.rows[0].id,
      status: handled ? "REVIEWED" : "NEEDS_REVIEW",
    });
    expect(requests).toBe(2);
  });
}
