import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  activityLogs,
  applicationRounds,
  applications,
  companyRecords,
  jobs,
  mailEvents,
  mailMessages,
  settings,
} from "@/db/schema";
import { normalizeCompany } from "@/features/applications/lanes";
import { sortStoredRejections, sortStoredRejectionsOnce } from "@/features/mail/rejection-sort";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `rejection-sort-${randomUUID()}`;
const name = `Halcyon ${prefix.slice(-8)}`;
const key = normalizeCompany(name);
const ids = { company: "", job: "", app: "" };
let counter = 0;
async function email(patch: Partial<typeof mailMessages.$inferInsert> = {}) {
  counter++;
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: `${prefix}@fixture.invalid`,
      sender: "talent@fixture.invalid",
      subject: `Rejection ${counter}`,
      receivedAt: new Date("2026-10-25T05:00:00Z"),
      classification: "REJECTION",
      companyKey: key,
      ...patch,
    })
    .returning();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: row.id, type: row.classification, confidence: 0.9 });
  return row;
}
const kind = async (id: string) => {
  const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, id));
  const events = await db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, id));
  return { message: message.classification, events: events.map((event) => event.type) };
};
const fixtures = like(mailMessages.accountEmail, `${prefix}%`);

describe.skipIf(!dbTests)("sorting stored rejection mail", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    const [company] = await db.insert(companyRecords).values({ slug: prefix, name }).returning();
    const [job] = await db
      .insert(jobs)
      .values({
        company: name,
        title: "Backend Engineer",
        canonicalUrl: `https://fixture.invalid/${prefix}/job`,
        dedupeKey: `${prefix}-job`,
        source: "MANUAL",
        status: "APPLIED",
      })
      .returning();
    const [app] = await db
      .insert(applications)
      .values({ jobId: job.id, source: "MANUAL", status: "APPLIED" })
      .returning();
    await db.insert(applicationRounds).values({
      applicationId: app.id,
      kind: "DSA",
      position: 1,
      outcome: "FAILED",
      scheduledAt: new Date("2026-10-22T05:00:00Z"),
    });
    Object.assign(ids, { company: company.id, job: job.id, app: app.id });
  });
  afterAll(async () => {
    await assertE2eDatabase();
    const mail = await db.select({ id: mailMessages.id }).from(mailMessages).where(fixtures);
    if (mail.length)
      await db.delete(activityLogs).where(
        inArray(
          activityLogs.entityId,
          mail.map((row) => row.id),
        ),
      );
    await db.delete(mailMessages).where(fixtures);
    await db.delete(applications).where(eq(applications.id, ids.app));
    await db.delete(jobs).where(eq(jobs.id, ids.job));
    await db.delete(companyRecords).where(eq(companyRecords.id, ids.company));
    await closeDatabase();
  });

  it("moves stored rejections after a round and leaves the rest", async () => {
    const after = await email();
    const before = await email({ receivedAt: new Date("2026-10-21T05:00:00Z") });
    const placeless = await email({ companyKey: null });
    expect(await sortStoredRejections(fixtures)).toBe(1);
    expect(await kind(after.id)).toEqual({
      message: "INTERVIEW_REJECTION",
      events: ["INTERVIEW_REJECTION"],
    });
    expect((await kind(before.id)).message).toBe("REJECTION");
    expect((await kind(placeless.id)).message).toBe("REJECTION");
  });

  it("is safe to run twice", async () => {
    await email();
    expect(await sortStoredRejections(fixtures)).toBe(1);
    expect(await sortStoredRejections(fixtures)).toBe(0);
  });

  it("skips mail the user retagged", async () => {
    const chosen = await email();
    await db.insert(activityLogs).values({
      action: "MAIL_RETAGGED",
      entityType: "MAIL",
      entityId: chosen.id,
      summary: "Retagged an email as applicationRejected",
      metadata: { from: "INTERVIEW", to: "REJECTION" },
    });
    expect(await sortStoredRejections(fixtures)).toBe(0);
    expect((await kind(chosen.id)).message).toBe("REJECTION");
  });

  it("runs once", async () => {
    await db
      .insert(settings)
      .values({ key: "rejectionSort", value: { at: new Date().toISOString(), moved: 0 } })
      .onConflictDoNothing();
    const waiting = await email();
    expect(await sortStoredRejectionsOnce()).toBeNull();
    expect((await kind(waiting.id)).message).toBe("REJECTION");
    const logs = await db
      .select()
      .from(activityLogs)
      .where(
        and(eq(activityLogs.action, "MAIL_REJECTIONS_SORTED"), eq(activityLogs.entityType, "MAIL")),
      );
    expect(logs.length).toBeLessThanOrEqual(1);
  });
});
