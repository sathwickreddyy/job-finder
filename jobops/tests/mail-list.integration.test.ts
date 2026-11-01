import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { applicationEvents, applications, jobs, mailMessages, mailTracking } from "@/db/schema";
import { listMail } from "@/features/mail/mail-list";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `mail-list-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const jobIds: string[] = [];
let counter = 0;
async function message(patch: Partial<typeof mailMessages.$inferInsert> = {}) {
  counter++;
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: `List ${counter}`,
      receivedAt: new Date(Date.UTC(2026, 9, 1, 0, counter)),
      companyKey: prefix,
      ...patch,
    })
    .returning();
  return row;
}

describe.skipIf(!dbTests)("shared mail list", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    if (jobIds.length) {
      await db.delete(applications).where(inArray(applications.jobId, jobIds));
      await db.delete(jobs).where(inArray(jobs.id, jobIds));
    }
    await closeDatabase();
  });

  it("filters by attention, tag, company, application and q", async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        company: `Company ${prefix}`,
        title: "SDE II",
        canonicalUrl: `https://fixture.invalid/${prefix}/filters`,
        dedupeKey: `${prefix}-filters`,
        source: "MANUAL",
      })
      .returning();
    jobIds.push(job.id);
    const [app] = await db.insert(applications).values({ jobId: job.id }).returning();
    const offer = await message({ classification: "OFFER", subject: `Offer letter ${prefix}` });
    const done = await message({
      classification: "INTERVIEW",
      attentionState: "DONE",
      processedAt: new Date(),
      bodyText: "needle_100% inside",
    });
    const linked = await message({ companyKey: null, linkedApplicationId: app.id });
    const scoped = { company: prefix };
    expect((await listMail({ ...scoped, attention: "open" })).items.map((i) => i.id)).toEqual([
      offer.id,
    ]);
    expect((await listMail({ ...scoped, tag: "process" })).items.map((i) => i.id)).toEqual([
      done.id,
    ]);
    expect((await listMail({ application: app.id })).items.map((i) => i.id)).toEqual([linked.id]);
    expect((await listMail({ ...scoped, q: "needle_100%" })).items.map((i) => i.id)).toEqual([
      done.id,
    ]);
    expect((await listMail({ ...scoped, q: "needle_1000" })).items).toHaveLength(0);
    expect((await listMail({ ...scoped, q: `offer LETTER ${prefix}` })).items[0].id).toBe(offer.id);
    await db.delete(mailMessages).where(inArray(mailMessages.id, [offer.id, done.id, linked.id]));
    await db.delete(applications).where(eq(applications.id, app.id));
  });

  it("pages with a cursor 50 at a time", async () => {
    for (let index = 0; index < 55; index++) await message();
    const first = await listMail({ company: prefix });
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const second = await listMail({ company: prefix, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const firstIds = new Set(first.items.map((item) => item.id));
    expect(second.items.some((item) => firstIds.has(item.id))).toBe(false);
    expect(first.openCount).toBe(55);
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
  });

  it("hides messages whose ledger row is excluded", async () => {
    const visible = await message();
    const hidden = await message({ subject: `Hidden ${prefix}` });
    await db.insert(mailTracking).values([
      {
        provider: "GMAIL",
        accountEmail: account,
        providerMessageId: `${prefix}-visible`,
        messageId: visible.id,
        sender: visible.sender,
        subject: visible.subject,
        receivedAt: visible.receivedAt,
        disposition: "kept",
      },
      {
        provider: "GMAIL",
        accountEmail: account,
        providerMessageId: `${prefix}-hidden`,
        messageId: hidden.id,
        sender: hidden.sender,
        subject: hidden.subject,
        receivedAt: hidden.receivedAt,
        disposition: "excluded",
      },
    ]);
    const result = await listMail({ company: prefix });
    expect(result.items.map((item) => item.id)).toEqual([visible.id]);
    expect(result.openCount).toBe(1);
    expect((await listMail({ q: `Hidden ${prefix}` })).items).toHaveLength(0);
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
  });

  it("returns the outcome recorded from the email", async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        company: `Company ${prefix}`,
        title: "SDE II",
        canonicalUrl: `https://fixture.invalid/${prefix}/outcome`,
        dedupeKey: `${prefix}-outcome`,
        source: "MANUAL",
      })
      .returning();
    jobIds.push(job.id);
    const [app] = await db.insert(applications).values({ jobId: job.id }).returning();
    const mail = await message({
      classification: "ASSESSMENT",
      attentionState: "DONE",
      linkedApplicationId: app.id,
    });
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: "ASSESSMENT_RECEIVED",
      summary: "OA received",
      payload: { outcome: "oa", mailMessageId: mail.id },
    });
    const [item] = (await listMail({ application: app.id })).items;
    expect(item).toMatchObject({ id: mail.id, outcome: "oa", attention: "handled" });
    await db.delete(mailMessages).where(eq(mailMessages.id, mail.id));
    await db.delete(applications).where(eq(applications.id, app.id));
  });
});
