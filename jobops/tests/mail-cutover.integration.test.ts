import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like, sql } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { mailConnections, mailMessages, mailTracking, settings } from "@/db/schema";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `mail-cutover-${randomUUID()}`;
const globalLatest = "latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312";
const migration = readFileSync("drizzle/0012_shared_mail_foundation.sql", "utf8");
const cutover = migration
  .slice(migration.indexOf("-- cutover:start"), migration.indexOf("-- cutover:end"))
  .replace("-- cutover:start", "")
  .split("--> statement-breakpoint")
  .map((chunk) => chunk.trim())
  .filter(Boolean);
async function runCutover() {
  for (const chunk of cutover) await db.execute(sql.raw(chunk));
}
async function message(name: string, companyKeys: string[], folders: string[]) {
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${name}`,
      provider: "OUTLOOK",
      accountEmail: `${prefix}@fixture.invalid`,
      sender: "talent@fixture.invalid",
      subject: `Cutover ${name}`,
      receivedAt: new Date("2026-10-28T10:00:00Z"),
    })
    .returning();
  await db.insert(mailTracking).values({
    provider: "OUTLOOK",
    accountEmail: `${prefix}@fixture.invalid`,
    providerMessageId: `${prefix}-${name}`,
    messageId: row.id,
    sender: row.sender,
    subject: row.subject,
    receivedAt: row.receivedAt,
    folders,
    companyKeys,
    disposition: "kept",
  });
  return row;
}

describe.skipIf(!dbTests)("shared mail cutover", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    const connections = await db
      .select({ id: mailConnections.id })
      .from(mailConnections)
      .where(like(mailConnections.email, `${prefix}%`));
    for (const { id } of connections)
      await db.delete(settings).where(like(settings.key, `%${id}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
    await closeDatabase();
  });

  it("backfills folders and a single company onto kept mail", async () => {
    const row = await message("single", ["fixture co"], ["Junk"]);
    expect(row).toMatchObject({ attentionState: "OPEN", companyKey: null, folders: [] });
    await runCutover();
    const [after] = await db.select().from(mailMessages).where(eq(mailMessages.id, row.id));
    expect(after.companyKey).toBe("fixture co");
    expect(after.folders).toEqual(["Junk"]);
    expect(after.attentionState).toBe("DONE");
    expect(after.processedAt).not.toBeNull();
  });

  it("leaves company empty when the ledger matched several companies", async () => {
    const row = await message("several", ["a", "b"], ["Inbox"]);
    await runCutover();
    const [after] = await db.select().from(mailMessages).where(eq(mailMessages.id, row.id));
    expect(after.companyKey).toBeNull();
  });

  it("keeps the global latest checkpoint as last fetch and drops the rest", async () => {
    const [connection] = await db
      .insert(mailConnections)
      .values({
        provider: "OUTLOOK",
        email: `${prefix}-checkpoint@fixture.invalid`,
        encryptedAccessToken: "unused-fixture",
      })
      .returning();
    const kept = `mailScan:v2:${connection.id}:${globalLatest}`;
    const dropped = [
      `mailScan:v2:${connection.id}:history:x`,
      `mailScan:v2:${connection.id}:latest:other`,
      `companyMailScan:v1:${connection.id}:y:latest`,
      `mailCursor:${connection.id}`,
      "mailPolicy:2026-10-30.4",
    ];
    await db
      .insert(settings)
      .values([
        { key: kept, value: { complete: true, until: "2026-10-29T10:00:00.000Z" } },
        ...dropped.map((key) => ({ key, value: { complete: false } })),
      ])
      .onConflictDoNothing();
    await runCutover();
    const [after] = await db
      .select()
      .from(mailConnections)
      .where(eq(mailConnections.id, connection.id));
    expect(after.lastSyncedAt?.toISOString()).toBe("2026-10-29T10:00:00.000Z");
    const remaining = await db
      .select({ key: settings.key })
      .from(settings)
      .where(inArray(settings.key, [kept, ...dropped, "mailCheckReleasedAt"]));
    expect(remaining.map((row) => row.key).sort()).toEqual([kept, "mailCheckReleasedAt"].sort());
  });

  it("is idempotent", async () => {
    const before = await db
      .select({ id: mailMessages.id, processedAt: mailMessages.processedAt })
      .from(mailMessages)
      .where(like(mailMessages.accountEmail, `${prefix}%`));
    const synced = await db
      .select({ id: mailConnections.id, lastSyncedAt: mailConnections.lastSyncedAt })
      .from(mailConnections)
      .where(like(mailConnections.email, `${prefix}%`));
    await runCutover();
    const after = await db
      .select({ id: mailMessages.id, processedAt: mailMessages.processedAt })
      .from(mailMessages)
      .where(like(mailMessages.accountEmail, `${prefix}%`));
    const syncedAfter = await db
      .select({ id: mailConnections.id, lastSyncedAt: mailConnections.lastSyncedAt })
      .from(mailConnections)
      .where(like(mailConnections.email, `${prefix}%`));
    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
    expect(syncedAfter).toEqual(synced);
  });
});
