import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
} from "@/db/schema";
import { applyOutcome } from "@/features/applications/outcome-service";
import { applyMailEffect, autoOutcomeEvent, undoAutoOutcome } from "@/features/mail/auto-apply";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prefix = `mail-auto-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const ids = { jobs: [] as string[], companies: [] as string[], apps: [] as string[] };
const NOW = new Date("2026-11-01T10:30:00+05:30");
let counter = 0;

/** A company with one sent application, and one email placed at it. */
async function fixture(
  classification: typeof mailMessages.$inferInsert.classification = "REJECTION",
  patch: Partial<typeof mailMessages.$inferInsert> = {},
) {
  counter++;
  const name = `Auto ${counter} ${prefix}`;
  const [company] = await db
    .insert(companyRecords)
    .values({ slug: `${prefix}-${counter}`, name })
    .returning();
  ids.companies.push(company.id);
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
      appliedAt: new Date("2026-10-20T05:00:00Z"),
    })
    .returning();
  ids.apps.push(app.id);
  const [mail] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: `Update ${counter}`,
      receivedAt: new Date("2026-10-29T05:00:00Z"),
      classification,
      companyKey: name.toLowerCase(),
      attentionState: "DONE",
      processedAt: new Date("2026-10-31T10:00:00Z"),
      ...patch,
    })
    .returning();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: mail.id, type: mail.classification, confidence: 0.9 });
  return { app, job, mail };
}
const message = async (id: string) =>
  (await db.select().from(mailMessages).where(eq(mailMessages.id, id)))[0];
const record = async (id: string) =>
  (await db.select().from(applications).where(eq(applications.id, id)))[0];
const details = async (id: string) =>
  (await db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, id))).map(
    (event) => event.details,
  );
const eventsFor = (id: string) =>
  db
    .select()
    .from(applicationEvents)
    .where(sql`${applicationEvents.payload}->>'mailMessageId' = ${id}`);
const run = <T>(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
  db.transaction(work);

describe.skipIf(!dbTests)("auto-applying mail", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    const mail = await db
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(like(mailMessages.accountEmail, `${prefix}%`));
    const entities = [...mail.map((row) => row.id), ...ids.apps];
    if (entities.length)
      await db.delete(activityLogs).where(inArray(activityLogs.entityId, entities));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    if (ids.jobs.length) {
      await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
      await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    }
    if (ids.companies.length)
      await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("acknowledge links the email and moves Applied to Acknowledged", async () => {
    const { app, mail } = await fixture("APPLICATION_ACKNOWLEDGEMENT");
    await run((tx) =>
      applyMailEffect(tx, mail.id, { kind: "acknowledge", applicationId: app.id }, NOW),
    );
    expect((await record(app.id)).status).toBe("ACKNOWLEDGED");
    expect(await message(mail.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: app.id,
    });
    expect(await details(mail.id)).toEqual([
      expect.objectContaining({ autoApplied: "acknowledge" }),
    ]);
    const [event] = await eventsFor(mail.id);
    expect(event).toMatchObject({ eventType: "ACKNOWLEDGEMENT_RECEIVED", payload: { auto: true } });
  });

  it("outcome records Rejected with auto payload and links the email", async () => {
    const { app, mail } = await fixture("REJECTION");
    await run((tx) =>
      applyMailEffect(
        tx,
        mail.id,
        { kind: "outcome", applicationId: app.id, outcome: "rejected" },
        NOW,
      ),
    );
    expect(await record(app.id)).toMatchObject({ status: "REJECTED", closedReason: "REJECTED" });
    const [event] = await eventsFor(mail.id);
    expect(event).toMatchObject({
      eventType: "REJECTION_RECEIVED",
      occurredAt: mail.receivedAt,
      payload: {
        auto: true,
        outcome: "rejected",
        previousStatus: "APPLIED",
        previousClosedReason: null,
        previousJobStatus: "APPLIED",
      },
    });
    expect(await message(mail.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: app.id,
    });
    expect(await details(mail.id)).toEqual([expect.objectContaining({ autoApplied: "rejected" })]);
  });

  it("ask reopens recovered mail and suggests the application", async () => {
    const { app, mail } = await fixture("ASSESSMENT");
    await run((tx) => applyMailEffect(tx, mail.id, { kind: "ask", applicationId: app.id }, NOW));
    expect(await message(mail.id)).toMatchObject({
      attentionState: "OPEN",
      linkedApplicationId: null,
    });
    expect(await details(mail.id)).toEqual([
      expect.objectContaining({ suggestedApplicationId: app.id }),
    ]);
    expect((await record(app.id)).status).toBe("APPLIED");
  });

  it("undo restores status, closed reason and job status and keeps the email linked", async () => {
    const { app, job, mail } = await fixture("REJECTION");
    await run((tx) =>
      applyMailEffect(
        tx,
        mail.id,
        { kind: "outcome", applicationId: app.id, outcome: "rejected" },
        NOW,
      ),
    );
    expect(await run((tx) => autoOutcomeEvent(tx, mail.id))).toMatchObject({
      applicationId: app.id,
      undoable: true,
    });
    await run((tx) => undoAutoOutcome(tx, mail.id, NOW));
    expect(await record(app.id)).toMatchObject({ status: "APPLIED", closedReason: null });
    expect((await db.select().from(jobs).where(eq(jobs.id, job.id)))[0].status).toBe("APPLIED");
    expect(await eventsFor(mail.id)).toHaveLength(0);
    expect(await message(mail.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: app.id,
    });
    expect(await details(mail.id)).toEqual([
      expect.objectContaining({ autoApplied: "rejected", autoUndone: true }),
    ]);
    expect(
      await db.select().from(activityLogs).where(eq(activityLogs.action, "MAIL_OUTCOME_UNDONE")),
    ).toContainEqual(expect.objectContaining({ entityId: mail.id }));
    expect(await run((tx) => autoOutcomeEvent(tx, mail.id))).toBeNull();
  });

  it("refuses undo once a newer outcome exists", async () => {
    const { app, mail } = await fixture("OFFER");
    await run((tx) =>
      applyMailEffect(
        tx,
        mail.id,
        { kind: "outcome", applicationId: app.id, outcome: "offer" },
        NOW,
      ),
    );
    expect((await record(app.id)).status).toBe("OFFER");
    await run((tx) =>
      applyOutcome(
        tx,
        {
          applicationId: app.id,
          outcome: "accepted",
          detail: { name: "", note: "", happenedAt: NOW },
        },
        NOW,
      ),
    );
    const after = (await record(app.id)).status;
    expect(await run((tx) => autoOutcomeEvent(tx, mail.id))).toMatchObject({ undoable: false });
    await expect(run((tx) => undoAutoOutcome(tx, mail.id, NOW))).rejects.toMatchObject({
      status: 409,
      message: "This outcome can no longer be undone. Correct it on the application.",
    });
    expect((await record(app.id)).status).toBe(after);
  });
});
