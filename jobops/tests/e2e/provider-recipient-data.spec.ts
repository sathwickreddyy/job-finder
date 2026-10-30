import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../../src/db";
import { mailConnections } from "../../src/db/schema";
import { encryptToken } from "../../src/services/mail/crypto";
import { checkConnection, checkKey } from "../../src/features/mail/check-service";
import type { MailContext } from "../../src/features/mail/context";
import { providerFor } from "../../src/services/mail/providers";
import { recipientPreview } from "../../src/services/mail/providers/display-metadata";
import type { MailConnection, MailProvider } from "../../src/services/mail/providers/types";
let pool: Pool;
let connection: MailConnection;
let previousKey: string | undefined;
let restore: (() => void) | undefined;
const context: MailContext = {
  baselineAt: "2026-09-01T00:00:00Z",
  companies: [],
  applications: [],
  outbound: [],
};
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Requires isolated jobops_e2e.");
  const marker = await pool.query("SELECT value FROM settings WHERE key='__jobops_e2e'");
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
});
test.afterEach(async () => {
  restore?.();
  restore = undefined;
  await guard();
  if (connection) {
    await pool.query("DELETE FROM mail_tracking WHERE account_email=$1", [connection.email]);
    const messages = await pool.query("SELECT id FROM mail_messages WHERE account_email=$1", [
      connection.email,
    ]);
    const logs = await pool.query(
      "SELECT id FROM activity_logs WHERE metadata->>'accountEmail'=$1",
      [connection.email],
    );
    await pool.query("DELETE FROM mail_messages WHERE id=ANY($1::uuid[])", [
      messages.rows.map((row) => row.id),
    ]);
    await pool.query("DELETE FROM activity_logs WHERE id=ANY($1::uuid[])", [
      logs.rows.map((row) => row.id),
    ]);
    await pool.query("DELETE FROM settings WHERE key LIKE $1", [`%${connection.id}%`]);
    await pool.query("DELETE FROM mail_connections WHERE id=$1", [connection.id]);
  }
  await closeDatabase();
  await pool.end();
  if (previousKey === undefined) delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.MAIL_TOKEN_ENCRYPTION_KEY = previousKey;
});
for (const provider of ["GMAIL", "OUTLOOK"] as const) {
  test(`${provider} check imports oversized recipient mail and its neighbour, then completes the window`, async () => {
    const id = randomUUID();
    [connection] = await db
      .insert(mailConnections)
      .values({
        id,
        provider,
        email: `${id}@example.invalid`,
        encryptedAccessToken: encryptToken("fixture-access"),
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
        lastSyncedAt: new Date("2026-09-01T00:00:00Z"),
      })
      .returning();
    const adapter: MailProvider = providerFor(provider);
    const { folders, scanMail } = adapter;
    restore = () => Object.assign(adapter, { folders, scanMail });
    const addresses = Array.from({ length: 45 }, (_, index) => `candidate${index}@example.invalid`);
    const recipient = addresses.join(", ");
    const update = (externalId: string, to: string) => ({
      externalId,
      internetMessageId: `<${externalId}@example.invalid>`,
      sender: "careers@example.invalid",
      subject: "We received your application",
      bodyText: "Thank you for applying to the Software Engineer role.",
      // The adapters shorten display recipients to the importer limit.
      recipient: recipientPreview(to),
      receivedAt: new Date().toISOString(),
      folders: ["Inbox"],
    });
    adapter.folders = async () => [];
    adapter.scanMail = async (_row, request) => {
      if (request.next) {
        expect(
          (
            await pool.query("SELECT id FROM mail_messages WHERE account_email=$1", [
              connection.email,
            ])
          ).rowCount,
        ).toBe(2);
        return { messages: [] };
      }
      return {
        messages: [
          update(`${id}-many`, recipient),
          update(`${id}-ordinary`, "one@example.invalid"),
        ],
        next: "second",
      };
    };
    expect(await checkConnection(connection, context)).toMatchObject({
      status: "more",
      newAttention: 2,
    });
    expect(
      (await pool.query("SELECT value FROM settings WHERE key=$1", [checkKey(id)])).rows[0].value
        .next,
    ).toBe("second");
    expect(await checkConnection(connection, context)).toMatchObject({ status: "done" });
    const persisted = await pool.query(
      "SELECT external_id,recipient,body_text,account_email FROM mail_messages WHERE account_email=$1 ORDER BY external_id",
      [connection.email],
    );
    expect(persisted.rowCount).toBe(2);
    expect(persisted.rows.find((row) => row.external_id.endsWith("-many"))).toMatchObject({
      recipient: recipient.slice(0, 999) + "…",
      body_text: "Thank you for applying to the Software Engineer role.",
      account_email: connection.email,
    });
    expect(persisted.rows.find((row) => row.external_id.endsWith("-ordinary"))).toMatchObject({
      recipient: "one@example.invalid",
    });
    expect(
      (
        await pool.query(
          "SELECT m.id FROM mail_messages m JOIN mail_events e ON e.mail_message_id=m.id WHERE m.account_email=$1",
          [connection.email],
        )
      ).rowCount,
    ).toBe(2);
    const [updated] = await db.select().from(mailConnections).where(eq(mailConnections.id, id));
    expect(updated.lastError).toBeNull();
    expect(updated.lastSyncedAt!.getTime()).toBeGreaterThan(connection.lastSyncedAt!.getTime());
  });
}
