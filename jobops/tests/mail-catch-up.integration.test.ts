import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like, sql } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  companyRecords,
  jobs,
  mailEvents,
  mailMessages,
  mailTracking,
  settings,
} from "@/db/schema";
import { CATCH_UP_KEY, catchUpMailSync } from "@/features/mail/catch-up";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prefix = `mail-catch-up-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const ids = { jobs: [] as string[], companies: [] as string[], apps: [] as string[] };
const NOW = new Date("2026-11-01T10:30:00+05:30");
let counter = 0;

async function company() {
  counter++;
  const name = `Catch ${counter} ${prefix}`;
  const [row] = await db
    .insert(companyRecords)
    .values({ slug: `${prefix}-${counter}`, name })
    .returning();
  ids.companies.push(row.id);
  const [job] = await db
    .insert(jobs)
    .values({
      company: name,
      title: "Backend Engineer",
      canonicalUrl: `https://fixture.invalid/${prefix}/${counter}`,
      dedupeKey: `${prefix}-${counter}`,
      source: "MANUAL",
      status: "APPLIED",
    })
    .returning();
  ids.jobs.push(job.id);
  const [app] = await db
    .insert(applications)
    .values({
      jobId: job.id,
      source: "MANUAL",
      status: "APPLIED",
      appliedAt: new Date("2026-10-02T10:00:00+05:30"),
    })
    .returning();
  ids.apps.push(app.id);
  return { app, key: name.toLowerCase() };
}
/** Stored handled as recovered history, the way company search found the user's mail. */
async function history(
  key: string,
  classification: NonNullable<typeof mailMessages.$inferInsert.classification>,
  receivedAt: string,
  details: Record<string, unknown> = {},
) {
  counter++;
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: `History ${counter}`,
      receivedAt: new Date(receivedAt),
      classification,
      companyKey: key,
      attentionState: "DONE",
      processedAt: new Date("2026-10-31T10:00:00Z"),
    })
    .returning();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: row.id, type: classification, confidence: 0.9, details });
  await db.insert(mailTracking).values({
    provider: "GMAIL",
    accountEmail: account,
    providerMessageId: `${prefix}-${counter}`,
    messageId: row.id,
    sender: row.sender,
    subject: row.subject,
    receivedAt: row.receivedAt,
    recovered: true,
  });
  return row;
}
const record = async (id: string) =>
  (await db.select().from(applications).where(eq(applications.id, id)))[0];
const eventsOf = (id: string) =>
  db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, id));
const forget = () => db.delete(settings).where(eq(settings.key, CATCH_UP_KEY));

describe.skipIf(!dbTests)("one-time mail catch-up", () => {
  beforeAll(assertE2eDatabase);
  beforeEach(forget);
  afterAll(async () => {
    await assertE2eDatabase();
    await forget();
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, ids.apps));
    await db.delete(activityLogs).where(
      inArray(
        activityLogs.entityId,
        db
          .select({ id: mailMessages.id })
          .from(mailMessages)
          .where(like(mailMessages.accountEmail, `${prefix}%`)),
      ),
    );
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    if (ids.jobs.length) {
      await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
      await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    }
    if (ids.companies.length)
      await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("applies an acknowledgement before a later rejection", async () => {
    const { app, key } = await company();
    // Stored newest first, as a search would, so the walk has to sort them.
    await history(key, "REJECTION", "2026-10-07T14:00:00+05:30");
    await history(key, "APPLICATION_ACKNOWLEDGEMENT", "2026-10-03T09:00:00+05:30");
    const result = await catchUpMailSync(NOW);
    expect(result.skipped).toBe(false);
    expect(result.applied).toBeGreaterThanOrEqual(2);
    expect(await record(app.id)).toMatchObject({ status: "REJECTED", closedReason: "REJECTED" });
    const events = await eventsOf(app.id);
    expect(events.find((event) => event.eventType === "ACKNOWLEDGEMENT_RECEIVED")).toMatchObject({
      occurredAt: new Date("2026-10-03T09:00:00+05:30"),
    });
    expect(events.find((event) => event.eventType === "REJECTION_RECEIVED")).toMatchObject({
      occurredAt: new Date("2026-10-07T14:00:00+05:30"),
      payload: expect.objectContaining({ previousStatus: "ACKNOWLEDGED", auto: true }),
    });
  });

  it("leaves emails the user handled alone", async () => {
    const { app, key } = await company();
    const mail = await history(key, "REJECTION", "2026-10-07T14:00:00+05:30", { justInfo: true });
    await catchUpMailSync(NOW);
    expect((await record(app.id)).status).toBe("APPLIED");
    const [stored] = await db.select().from(mailMessages).where(eq(mailMessages.id, mail.id));
    expect(stored).toMatchObject({ attentionState: "DONE", linkedApplicationId: null });
  });

  it("is idempotent", async () => {
    const { app, key } = await company();
    await history(key, "REJECTION", "2026-10-07T14:00:00+05:30");
    await catchUpMailSync(NOW);
    const before = (await eventsOf(app.id)).length;
    expect(await catchUpMailSync(NOW)).toEqual({ skipped: true, applied: 0, asked: 0, failed: 0 });
    expect(await eventsOf(app.id)).toHaveLength(before);
    const [marker] = await db.select().from(settings).where(eq(settings.key, CATCH_UP_KEY));
    expect(marker.value).toMatchObject({ version: 1 });
    expect(
      (
        await db
          .select({ count: sql<number>`count(*)::int` })
          .from(applicationEvents)
          .where(eq(applicationEvents.applicationId, app.id))
      )[0].count,
    ).toBe(before);
  });
});
