import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  applicationEvents,
  applicationRounds,
  applications,
  companyRecords,
  jobSnapshots,
  jobs,
  mailMessages,
  resumeAssessments,
  resumeVersions,
  resumes,
} from "@/db/schema";
import { resolveCompanySlug } from "@/features/companies/resolve-slug";
import { readCompanyApplications } from "@/features/companies/applications";
import type { TimelineDay } from "@/features/timeline/entries";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `company-apps-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const name = `Apps ${prefix}`;
const key = name.toLowerCase();
const now = new Date("2026-11-16T10:00:00+05:30");
const ids = { jobs: [] as string[], companies: [] as string[], apps: [] as string[] };
const made: Record<string, string> = {};
let counter = 0;

async function application(
  title: string,
  patch: Partial<typeof applications.$inferInsert> = {},
  job: Partial<typeof jobs.$inferInsert> = {},
) {
  const [row] = await db
    .insert(jobs)
    .values({
      company: name,
      title,
      canonicalUrl: `https://fixture.invalid/${prefix}/${title}`,
      dedupeKey: `${prefix}-${title}`,
      source: "MANUAL",
      status: "APPLIED",
      ...job,
    })
    .returning();
  ids.jobs.push(row.id);
  const [app] = await db
    .insert(applications)
    .values({ jobId: row.id, source: "DIRECT", status: "APPLIED", ...patch })
    .returning();
  ids.apps.push(app.id);
  if (patch.appliedAt)
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: "APPLICATION_SUBMITTED",
      summary: `Applied for ${title}`,
      occurredAt: patch.appliedAt,
    });
  return { id: app.id, jobId: row.id };
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
      subject: `Apps ${counter}`,
      receivedAt: new Date(Date.UTC(2026, 10, 10, counter)),
      classification: "FOLLOW_UP",
      companyKey: key,
      ...patch,
    })
    .returning();
  return row.id;
}
const entries = (days: TimelineDay[]) => days.flatMap((day) => day.entries);
const mailIds = (days: TimelineDay[]) =>
  entries(days).flatMap((entry) => (entry.type === "mail" ? [entry.item.id] : []));
const stepTexts = (days: TimelineDay[]) =>
  entries(days).flatMap((entry) => (entry.type === "step" ? [entry.text] : []));

describe.skipIf(!dbTests)("company applications", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    const [company] = await db.insert(companyRecords).values({ slug: prefix, name }).returning();
    ids.companies.push(company.id);
    const older = await application("Older role", {
      appliedAt: new Date("2026-11-02T05:00:00Z"),
    });
    const newer = await application(
      "Newer role",
      { status: "TECHNICAL_INTERVIEW", appliedAt: new Date("2026-11-04T05:00:00Z") },
      { externalId: "JB-1" },
    );
    await application("Former job", { source: "PREVIOUS_JOB", status: "OFFER" });
    made.older = older.id;
    made.newer = newer.id;
    made.olderMail = await email({ linkedApplicationId: older.id, companyKey: null });
    made.newerMail = await email({ linkedApplicationId: newer.id });
    made.loose = await email({ subject: `Loose ${prefix}` });
    // The newer application has a cleared round, then a booked one, then a cancelled one.
    await db.insert(applicationRounds).values([
      { applicationId: newer.id, kind: "DSA", position: 1, outcome: "PASSED" },
      { applicationId: newer.id, kind: "HR", position: 2, outcome: "SCHEDULED" },
      { applicationId: newer.id, kind: "OTHER", position: 3, outcome: "CANCELLED" },
    ]);
    const rounds = await db
      .select()
      .from(applicationRounds)
      .where(inArray(applicationRounds.applicationId, [newer.id]));
    for (const round of rounds) made[`round${round.position}`] = round.id;
    // A file scored against the newer role's job: the older role is a different job.
    const [family] = await db
      .insert(resumes)
      .values({ name: `Family ${prefix}`, slug: prefix })
      .returning();
    const [snapshot] = await db
      .insert(jobSnapshots)
      .values({ jobId: newer.jobId, description: "Build services" })
      .returning();
    const [version] = await db
      .insert(resumeVersions)
      .values({
        resumeId: family.id,
        versionLabel: "v1",
        originalFilename: `${prefix}.pdf`,
        storagePath: `${prefix}.pdf`,
        fileSize: 1,
        sha256: prefix,
        targetJobId: newer.jobId,
        targetSnapshotId: snapshot.id,
      })
      .returning();
    made.version = version.id;
    made.family = family.id;
    await db.insert(resumeAssessments).values({
      versionId: version.id,
      snapshotId: snapshot.id,
      source: "resume-ats-optimizer",
      method: "test",
      score: 85,
      assessedAt: new Date("2026-11-05T00:00:00Z"),
      details: { match_score: 85, target: 80, method: "test", format: [], keywords: [] },
    });
    await db
      .update(applications)
      .set({ resumeVersionId: version.id })
      .where(inArray(applications.id, [older.id, newer.id]));
  });
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(resumeAssessments).where(inArray(resumeAssessments.versionId, [made.version]));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
    await db.delete(resumeVersions).where(inArray(resumeVersions.id, [made.version]));
    await db.delete(resumes).where(inArray(resumes.id, [made.family]));
    await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("lists each application, newest applied first, without previous jobs", async () => {
    const { rows } = await readCompanyApplications(key, {}, now);
    expect(rows.map((row) => row.record.role)).toEqual(["Newer role", "Older role"]);
    expect(rows.map((row) => row.record.requisition)).toEqual(["JB-1", null]);
  });

  it("gives each application only its own mail and steps", async () => {
    const { rows } = await readCompanyApplications(key, {}, now);
    const [newer, older] = rows;
    expect(mailIds(newer.days)).toEqual([made.newerMail]);
    expect(stepTexts(newer.days)).toEqual(["Applied for Newer role"]);
    expect(mailIds(older.days)).toEqual([made.olderMail]);
    expect(stepTexts(older.days)).toEqual(["Applied for Older role"]);
    expect(newer.steps[0]).toMatchObject({ label: "Applied" });
  });

  it("keeps open and handled company mail on no application apart", async () => {
    const handled = await email({ subject: `Done ${prefix}`, attentionState: "DONE" });
    const { newMail, unplaced, lastActivity } = await readCompanyApplications(key, {}, now);
    expect(mailIds(newMail.days)).toEqual([made.loose]);
    expect(newMail.more).toBe(false);
    expect(mailIds(unplaced)).toEqual([handled]);
    expect(entries(unplaced).every((entry) => entry.type === "mail")).toBe(true);
    // The handled email (counter order) is the newest past entry of all.
    expect(lastActivity?.kind).toBe("Email");
    expect(lastActivity?.at).toBe(entries(unplaced).find((entry) => entry.type === "mail")?.at);
    await db.delete(mailMessages).where(inArray(mailMessages.id, [handled]));
  });

  it("shows scores only when the submitted file targets the same job", async () => {
    const { rows } = await readCompanyApplications(key, {}, now);
    const [newer, older] = rows;
    expect(newer.scores?.["resume-ats-optimizer"]).toMatchObject({ score: 85 });
    expect(older.scores).toBeNull();
  });

  it("offers a round's result only on the booked round", async () => {
    const { rows } = await readCompanyApplications(key, {}, now);
    const { roundCards } = rows[0];
    expect(Object.keys(roundCards).sort()).toEqual([made.round1, made.round2].sort());
    expect(roundCards[made.round2].outcomes).toEqual(["passed", "failed", "rescheduled"]);
    expect(roundCards[made.round1].outcomes).toEqual([]);
    expect(roundCards[made.round2]).toMatchObject({ recordId: made.newer, today: "2026-11-16" });
  });

  it("offers the file choices and no older link without more mail", async () => {
    const data = await readCompanyApplications(key, { open: made.newer }, now);
    expect(data.rows.every((row) => row.olderHref === null)).toBe(true);
    expect(data.versions.some((version) => version.id === made.version)).toBe(true);
  });

  it("finds unlinked company mail older than the newest 50 emails", async () => {
    const old = await email({ subject: `Ancient ${prefix}`, receivedAt: new Date("2025-01-01Z") });
    await db.insert(mailMessages).values(
      Array.from({ length: 52 }, (_, index) => ({
        externalId: `${prefix}-bulk-${index}`,
        provider: "GMAIL" as const,
        accountEmail: account,
        sender: "talent@fixture.invalid",
        subject: `Bulk ${index}`,
        receivedAt: new Date(Date.UTC(2026, 10, 12, 0, index)),
        classification: "FOLLOW_UP" as const,
        companyKey: key,
        linkedApplicationId: made.newer,
      })),
    );
    await db
      .update(mailMessages)
      .set({ attentionState: "DONE" })
      .where(inArray(mailMessages.id, [old]));
    const { unplaced, unplacedOlderHref, newMail } = await readCompanyApplications(key, {}, now);
    expect(mailIds(newMail.days)).toEqual([made.loose]);
    expect(mailIds(unplaced)).toEqual([old]);
    expect(unplacedOlderHref).toBeNull();
  });

  it("keeps last activity the same on older pages of a row and of handled mail", async () => {
    await db.insert(mailMessages).values(
      Array.from({ length: 52 }, (_, index) => ({
        externalId: `${prefix}-done-${index}`,
        provider: "GMAIL" as const,
        accountEmail: account,
        sender: "talent@fixture.invalid",
        subject: `Done ${index}`,
        receivedAt: new Date(Date.UTC(2026, 10, 13, 0, index)),
        classification: "FOLLOW_UP" as const,
        companyKey: key,
        attentionState: "DONE" as const,
      })),
    );
    const first = await readCompanyApplications(key, {}, now);
    const rowHref = first.rows.find((row) => row.record.id === made.newer)?.olderHref;
    expect(rowHref).toBeTruthy();
    expect(first.unplacedOlderHref).toBeTruthy();
    const rowCursor = new URLSearchParams(rowHref!.split("#")[0]).get("cursor")!;
    const unplacedCursor = new URLSearchParams(first.unplacedOlderHref!.split("#")[0]).get(
      "unplacedCursor",
    )!;
    expect(first.lastActivity).not.toBeNull();
    const paged = await readCompanyApplications(key, { open: made.newer, cursor: rowCursor }, now);
    expect(paged.lastActivity).toEqual(first.lastActivity);
    const older = await readCompanyApplications(key, { unplacedCursor }, now);
    expect(older.lastActivity).toEqual(first.lastActivity);
  });

  describe("company page slug", () => {
    it("resolves a company with applications but no record to the minimal page", async () => {
      expect(await resolveCompanySlug(encodeURIComponent(key), [])).toEqual({
        kind: "minimal",
        key,
        name,
      });
    });

    it("prefers a company record whose id matches", async () => {
      const company = { id: key };
      expect(await resolveCompanySlug(key, [company])).toEqual({ kind: "company", company });
    });

    it("is not found without records, or on a malformed escape", async () => {
      expect(await resolveCompanySlug("nobody-" + prefix, [])).toEqual({ kind: "missing" });
      expect(await resolveCompanySlug("%E0%A4%A", [])).toEqual({ kind: "missing" });
    });
  });
});
