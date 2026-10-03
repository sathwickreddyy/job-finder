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
let previousKey: string | undefined;
const originalFetch = globalThis.fetch;
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
  globalThis.fetch = originalFetch;
  await guard();
  if (connection) {
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
    await pool.query("DELETE FROM settings WHERE key=$1", [`mailCursor:${connection.id}`]);
    await pool.query("DELETE FROM mail_connections WHERE id=$1", [connection.id]);
  }
  await closeDatabase();
  await pool.end();
  if (previousKey === undefined) delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.MAIL_TOKEN_ENCRYPTION_KEY = previousKey;
});
for (const provider of ["GMAIL", "OUTLOOK"] as const) {
  test(`${provider} actual adapter imports oversized recipient mail and its neighbour, then advances continuation`, async () => {
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
    const addresses = Array.from({ length: 45 }, (_, index) => `candidate${index}@example.invalid`);
    const recipient = addresses.join(", ");
    const externalIds = [`${id}:many`, `${id}:ordinary`];
    let continued = false;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.has("pageToken") || url.searchParams.has("$skiptoken")) {
        continued = true;
        expect(
          (
            await pool.query("SELECT id FROM mail_messages WHERE account_email=$1", [
              connection.email,
            ])
          ).rowCount,
        ).toBe(2);
        expect(
          (await pool.query("SELECT value FROM settings WHERE key=$1", [`mailCursor:${id}`]))
            .rowCount,
        ).toBe(1);
        return Response.json(provider === "GMAIL" ? { messages: [] } : { value: [] });
      }
      if (provider === "GMAIL") {
        if (url.pathname.endsWith("/messages"))
          return Response.json({
            messages: externalIds.map((id) => ({ id })),
            nextPageToken: "second",
          });
        const externalId = decodeURIComponent(url.pathname.split("/messages/")[1]);
        return Response.json({
          id: externalId,
          internalDate: String(Date.now()),
          payload: {
            headers: [
              { name: "From", value: "talent@example.invalid" },
              { name: "Subject", value: "Interview invitation" },
              {
                name: "To",
                value: externalId === externalIds[0] ? recipient : "one@example.invalid",
              },
            ],
            mimeType: "text/plain",
            body: { data: Buffer.from("Interview details preserved").toString("base64url") },
          },
        });
      }
      return Response.json({
        value: externalIds.map((externalId, index) => ({
          id: `Immutable:${externalId}`,
          internetMessageId: externalId,
          from: { emailAddress: { address: "talent@example.invalid" } },
          subject: "Interview invitation",
          body: { contentType: "text", content: "Interview details preserved" },
          toRecipients: (index ? ["one@example.invalid"] : addresses).map((address) => ({
            emailAddress: { address },
          })),
          receivedDateTime: new Date().toISOString(),
        })),
        "@odata.nextLink":
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=second",
      });
    };
    expect(await refreshConnection(connection)).toEqual({
      imported: 2,
      duplicates: 0,
      more: false,
    });
    expect(continued).toBe(true);
    const persisted = await pool.query(
      "SELECT external_id,recipient,body_text,account_email FROM mail_messages WHERE account_email=$1 ORDER BY external_id",
      [connection.email],
    );
    expect(persisted.rowCount).toBe(2);
    expect(persisted.rows.find((row) => row.external_id === externalIds[0])).toMatchObject({
      recipient: recipient.slice(0, 999) + "…",
      body_text: "Interview details preserved",
      account_email: connection.email,
    });
    expect(persisted.rows.find((row) => row.external_id === externalIds[1])).toMatchObject({
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
    expect(
      (await pool.query("SELECT value FROM settings WHERE key=$1", [`mailCursor:${id}`])).rowCount,
    ).toBe(0);
    const [updated] = await db.select().from(mailConnections).where(eq(mailConnections.id, id));
    expect(updated.lastError).toBeNull();
    expect(updated.lastSyncedAt!.getTime()).toBeGreaterThan(connection.lastSyncedAt!.getTime());
  });
}
