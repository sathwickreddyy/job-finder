import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  applicationEvents,
  applications,
  companyRecords,
  jobs,
  mailEvents,
  mailMessages,
  mailTracking,
} from "@/db/schema";
import type { TimelineDay } from "@/features/timeline/entries";
import { readCompanyIndex, readCompanyTimeline, readHomeMail } from "@/features/timeline/read";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `company-timeline-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const name = `Timeline ${prefix}`;
const key = name.toLowerCase();
const canonical = `Canon ${prefix}`;
const alias = `Alias ${prefix}`;
const now = new Date("2026-10-31T10:00:00+05:30");
const ids = { jobs: [] as string[], companies: [] as string[], apps: [] as string[] };
const mail: Record<string, string> = {};
let counter = 0;

async function application(title: string, appliedAt: Date, company = name) {
  const [job] = await db
    .insert(jobs)
    .values({
      company,
      title,
      canonicalUrl: `https://fixture.invalid/${prefix}/${title}`,
      dedupeKey: `${prefix}-${title}`,
      source: "MANUAL",
      status: "APPLIED",
    })
    .returning();
  ids.jobs.push(job.id);
  const [app] = await db
    .insert(applications)
    .values({ jobId: job.id, source: "DIRECT", status: "APPLIED", appliedAt })
    .returning();
  ids.apps.push(app.id);
  await db.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: "APPLICATION_SUBMITTED",
    summary: `Applied for ${title}`,
    occurredAt: appliedAt,
  });
  return app.id;
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
      subject: `Timeline ${counter}`,
      receivedAt: new Date(Date.UTC(2026, 9, 25, counter)),
      classification: "FOLLOW_UP",
      companyKey: key,
      ...patch,
    })
    .returning();
  return row;
}
const flat = (days: TimelineDay[]) => days.flatMap((day) => day.entries);
const mailIds = (days: TimelineDay[]) =>
  flat(days).flatMap((entry) => (entry.type === "mail" ? [entry.item.id] : []));
const stepTexts = (days: TimelineDay[]) =>
  flat(days).flatMap((entry) => (entry.type === "step" ? [entry.text] : []));

describe.skipIf(!dbTests)("company timeline", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    const [company] = await db.insert(companyRecords).values({ slug: prefix, name }).returning();
    ids.companies.push(company.id);
    const backend = await application("Backend", new Date("2026-10-20T05:00:00Z"));
    const platform = await application("Platform", new Date("2026-10-22T05:00:00Z"));
    mail.placed = (await email()).id;
    mail.offer = (await email({ classification: "OFFER", subject: `Offer letter ${prefix}` })).id;
    mail.linked = (await email({ companyKey: null, linkedApplicationId: platform })).id;
    mail.backend = (await email({ linkedApplicationId: backend })).id;
    const hidden = await email({ subject: `Hidden ${prefix}` });
    mail.hidden = hidden.id;
    await db.insert(mailTracking).values({
      provider: "GMAIL",
      accountEmail: account,
      providerMessageId: `${prefix}-hidden`,
      messageId: hidden.id,
      sender: hidden.sender,
      subject: hidden.subject,
      receivedAt: hidden.receivedAt,
      disposition: "excluded",
    });
    const [aliased] = await db
      .insert(companyRecords)
      .values({ slug: `${prefix}-canon`, name: canonical, aliases: [alias] })
      .returning();
    ids.companies.push(aliased.id);
    await application("Aliased", new Date("2026-10-21T05:00:00Z"), alias);
    mail.canonical = (await email({ companyKey: canonical.toLowerCase() })).id;
    mail.unplaced = (await email({ companyKey: null, subject: `Unplaced ${prefix}` })).id;
  });
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
    await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("reads one company's mail and steps newest first", async () => {
    const timeline = await readCompanyTimeline(key, {}, now);
    expect(timeline.company).toMatchObject({ key, name, slug: prefix });
    expect(timeline.roles.map((role) => role.role).sort()).toEqual(["Backend", "Platform"]);
    expect(timeline.roles[0]).toMatchObject({ source: "DIRECT", phase: "Applied" });
    expect(timeline.roles[0].state).toMatchObject({ source: "DIRECT", status: "APPLIED" });
    expect(timeline.nextCursor).toBeNull();
    expect(mailIds(timeline.days)).toEqual([mail.backend, mail.linked, mail.offer, mail.placed]);
    expect(stepTexts(timeline.days)).toEqual(["Applied for Platform", "Applied for Backend"]);
    const ats = flat(timeline.days).map((entry) => entry.at);
    expect(ats).toEqual([...ats].sort().reverse());
  });

  it("includes linked mail without a company key", async () => {
    const timeline = await readCompanyTimeline(key, {}, now);
    expect(mailIds(timeline.days)).toContain(mail.linked);
  });

  it("never returns excluded mail", async () => {
    const timeline = await readCompanyTimeline(key, { q: `Hidden ${prefix}` }, now);
    expect(mailIds(timeline.days)).toEqual([]);
    expect(mailIds((await readCompanyTimeline(key, {}, now)).days)).not.toContain(mail.hidden);
  });

  it("filters by tag and role", async () => {
    const offers = await readCompanyTimeline(key, { tag: "offer" }, now);
    expect(mailIds(offers.days)).toEqual([mail.offer]);
    expect(stepTexts(offers.days)).toEqual([]);
    const platform = ids.apps[1];
    const role = await readCompanyTimeline(key, { application: platform }, now);
    expect(mailIds(role.days)).toEqual([mail.linked]);
    expect(stepTexts(role.days)).toEqual(["Applied for Platform"]);
  });

  it("merges alias and canonical keys into one row", async () => {
    const { rows } = await readCompanyIndex({}, now);
    expect(rows.filter((row) => row.key === canonical.toLowerCase())).toEqual([
      expect.objectContaining({ name: canonical, slug: `${prefix}-canon`, newCount: 1 }),
    ]);
    expect(rows.some((row) => row.key === alias.toLowerCase())).toBe(false);
  });

  it("counts linked mail without a company key", async () => {
    const { rows } = await readCompanyIndex({}, now);
    expect(rows.find((row) => row.key === key)).toMatchObject({
      group: "needs",
      newCount: 4,
      signal: "Application update",
    });
  });

  it("narrows the index by tag and search", async () => {
    const offers = await readCompanyIndex({ tag: "offer" }, now);
    expect(offers.rows.find((row) => row.key === key)?.matches).toBe(1);
    expect(offers.rows.some((row) => row.key === canonical.toLowerCase())).toBe(false);
    const search = await readCompanyIndex({ q: `offer letter ${prefix}` }, now);
    expect(search.rows.map((row) => [row.key, row.matches])).toEqual([[key, 1]]);
    expect(search.home.matches).toBe(0);
    const home = await readCompanyIndex({ q: `Unplaced ${prefix}` }, now);
    expect(home.rows).toEqual([]);
    expect(home.home.matches).toBe(1);
    expect((await readCompanyIndex({ q: `Hidden ${prefix}` }, now)).rows).toEqual([]);
  });

  it("counts the company's mail by tag", async () => {
    const all = await readCompanyTimeline(key, { tag: "offer" }, now);
    expect(all.tags).toEqual({ opportunity: 0, process: 3, offer: 1, rejected: 0, other: 0 });
    const role = await readCompanyTimeline(key, { application: ids.apps[1] }, now);
    expect(role.tags).toMatchObject({ process: 1, offer: 0 });
  });

  it("leaves steps newer than an older page out of it", async () => {
    const offer = (await db.select().from(mailMessages).where(eq(mailMessages.id, mail.offer)))[0];
    const [later] = await db
      .insert(applicationEvents)
      .values({
        applicationId: ids.apps[1],
        eventType: "FOLLOW_UP_SENT",
        summary: "Followed up",
        occurredAt: new Date("2026-10-26T05:00:00Z"),
      })
      .returning();
    const cursor = `${offer.receivedAt.toISOString()}|${offer.id}`;
    const older = await readCompanyTimeline(key, { cursor }, now);
    expect(mailIds(older.days)).toEqual([mail.placed]);
    expect(stepTexts(older.days)).toEqual(["Applied for Platform", "Applied for Backend"]);
    expect(stepTexts((await readCompanyTimeline(key, {}, now)).days)).toContain("Followed up");
    await db.delete(applicationEvents).where(eq(applicationEvents.id, later.id));
  });

  it("shows mail saved as an opening as recorded", async () => {
    const saved = await email({
      companyKey: null,
      subject: `Saved role ${prefix}`,
      classification: "RECRUITER_OUTREACH",
      attentionState: "DONE",
      processedAt: new Date(),
    });
    await db.insert(mailEvents).values({
      mailMessageId: saved.id,
      type: "RECRUITER_OUTREACH",
      confidence: 0.9,
      status: "REVIEWED",
      details: { savedOpeningId: randomUUID() },
    });
    const home = await readHomeMail({ q: `Saved role ${prefix}` }, now);
    expect(home.days.flatMap((day) => day.entries)).toEqual([
      expect.objectContaining({ type: "mail", recorded: "Saved as an opening" }),
    ]);
  });

  it("lists Needs a home mail only", async () => {
    const home = await readHomeMail({ q: `Unplaced ${prefix}` }, now);
    expect(mailIds(home.days)).toEqual([mail.unplaced]);
    expect(home.nextCursor).toBeNull();
    expect(mailIds((await readHomeMail({ q: `offer letter ${prefix}` }, now)).days)).toEqual([]);
  });
});
