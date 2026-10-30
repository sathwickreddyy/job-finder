import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";
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
import { handleMail, updateMail } from "@/features/mail/handle-service";
import { dismissMessages } from "@/features/mail/handling-service";
import { listMail } from "@/features/mail/mail-list";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `mail-handle-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const names = { single: `Single ${prefix}`, double: `Double ${prefix}` };
const keys = { single: names.single.toLowerCase(), double: names.double.toLowerCase() };
const apps: Record<string, string[]> = { single: [], double: [] };
const ids = { jobs: [] as string[], companies: [] as string[] };
let counter = 0;

async function company(kind: "single" | "double", count: number) {
  const [row] = await db
    .insert(companyRecords)
    .values({ slug: `${prefix}-${kind}`, name: names[kind] })
    .returning();
  ids.companies.push(row.id);
  for (let index = 0; index < count; index++) {
    const [job] = await db
      .insert(jobs)
      .values({
        company: names[kind],
        title: `Backend Engineer ${index + 1}`,
        canonicalUrl: `https://fixture.invalid/${prefix}/${kind}/${index}`,
        dedupeKey: `${prefix}-${kind}-${index}`,
        source: "MANUAL",
        status: "APPLIED",
      })
      .returning();
    ids.jobs.push(job.id);
    const [app] = await db
      .insert(applications)
      .values({ jobId: job.id, status: "APPLIED", appliedAt: new Date("2026-10-20T05:00:00Z") })
      .returning();
    apps[kind].push(app.id);
  }
}
async function email(patch: Partial<typeof mailMessages.$inferInsert> = {}) {
  counter++;
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: `Handle ${counter}`,
      receivedAt: new Date("2026-10-29T05:00:00Z"),
      classification: "ASSESSMENT",
      companyKey: keys.single,
      ...patch,
    })
    .returning();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: row.id, type: row.classification, confidence: 0.9 });
  return row;
}
const message = async (id: string) =>
  (await db.select().from(mailMessages).where(eq(mailMessages.id, id)))[0];
const logs = (id: string, action: string) =>
  db
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.entityId, id), eq(activityLogs.action, action)));
const outcomeEvents = (id: string) =>
  db
    .select()
    .from(applicationEvents)
    .where(sql`${applicationEvents.payload}->>'mailMessageId' = ${id}`);
const oa = { outcome: "oa", details: { at: "2026-11-03T18:00:00+05:30" } };

describe.skipIf(!dbTests)("handling mail", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    await company("single", 1);
    await company("double", 2);
  });
  afterAll(async () => {
    await assertE2eDatabase();
    const mail = await db
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(like(mailMessages.accountEmail, `${prefix}%`));
    if (mail.length)
      await db.delete(activityLogs).where(
        inArray(
          activityLogs.entityId,
          mail.map((row) => row.id),
        ),
      );
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
    await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("just info clears attention and is idempotent", async () => {
    const row = await email();
    const first = await handleMail(row.id, { justInfo: true });
    expect(first).toMatchObject({ id: row.id, attention: "handled" });
    const stored = await message(row.id);
    const [event] = await db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, row.id));
    expect(event).toMatchObject({ status: "REVIEWED", details: { justInfo: true } });
    expect(await logs(row.id, "MAIL_JUST_INFO")).toHaveLength(1);
    expect(await handleMail(row.id, { justInfo: true })).toEqual(first);
    expect((await message(row.id)).processedAt).toEqual(stored.processedAt);
    expect(await logs(row.id, "MAIL_JUST_INFO")).toHaveLength(1);
  });

  it("records an outcome on the company's single open application with the email as source", async () => {
    const row = await email();
    const item = await handleMail(row.id, oa);
    expect(item).toMatchObject({
      attention: "handled",
      outcome: "oa",
      application: { id: apps.single[0] },
    });
    const events = await outcomeEvents(row.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ applicationId: apps.single[0], payload: { outcome: "oa" } });
    expect(await message(row.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: apps.single[0],
    });
  });

  it("asks for applicationId when two applications are open", async () => {
    const row = await email({ companyKey: keys.double });
    await expect(handleMail(row.id, oa)).rejects.toMatchObject({
      status: 409,
      details: {
        candidates: expect.arrayContaining(
          apps.double.map((id) => expect.objectContaining({ id })),
        ),
      },
    });
    expect((await message(row.id)).attentionState).toBe("OPEN");
  });

  it("refuses an application at another company", async () => {
    const row = await email();
    await expect(
      handleMail(row.id, { ...oa, applicationId: apps.double[0] }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining(names.single) });
    await expect(handleMail((await email({ companyKey: null })).id, oa)).rejects.toMatchObject({
      status: 409,
      message: "Place this email at a company or pass applicationId.",
    });
  });

  it("a second outcome on a handled email is refused", async () => {
    const row = await email({ companyKey: keys.double });
    await handleMail(row.id, { ...oa, applicationId: apps.double[1] });
    await expect(
      handleMail(row.id, { outcome: "rejected", applicationId: apps.double[1] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await outcomeEvents(row.id)).toHaveLength(1);
  });

  it("retag writes classification, event type and an activity log", async () => {
    const row = await email({ classification: "INTERVIEW" });
    const item = await updateMail(row.id, { tag: "offer" });
    expect(item).toMatchObject({ tag: "offer", attention: "open" });
    expect((await message(row.id)).classification).toBe("OFFER");
    const events = await db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, row.id));
    expect(events.map((event) => event.type)).toEqual(["OFFER"]);
    expect((await logs(row.id, "MAIL_RETAGGED"))[0].metadata).toEqual({
      from: "INTERVIEW",
      to: "OFFER",
    });
  });

  it("placing an email does not change attention", async () => {
    const row = await email({ companyKey: null });
    expect(await updateMail(row.id, { company: keys.single })).toMatchObject({
      company: { key: keys.single, name: names.single },
      attention: "open",
    });
    expect(await updateMail(row.id, { application: apps.single[0] })).toMatchObject({
      application: { id: apps.single[0] },
      attention: "open",
    });
    await expect(updateMail(row.id, { company: keys.double })).rejects.toMatchObject({
      status: 409,
    });
    expect(await updateMail(row.id, { application: null })).toMatchObject({
      application: null,
      company: { key: keys.single },
      attention: "open",
    });
    expect(await logs(row.id, "MAIL_PLACED")).toHaveLength(3);
  });

  it("lane dismissal and API just info write the same flag", async () => {
    const dismissed = await email({ companyKey: keys.double, subject: `Lane ${prefix}` });
    const informed = await email({ companyKey: keys.double, subject: `Lane ${prefix}` });
    await db.transaction((tx) => dismissMessages(tx, { ids: [dismissed.id] }, new Date()));
    await handleMail(informed.id, { justInfo: true });
    const { items } = await listMail({ q: `Lane ${prefix}` });
    expect(items.map((item) => [item.id, item.attention]).sort()).toEqual(
      [
        [dismissed.id, "handled"],
        [informed.id, "handled"],
      ].sort(),
    );
  });
});
