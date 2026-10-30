import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { activityLogs, applicationEvents, applications, jobs } from "@/db/schema";
import { findApplications, recordAgentApplication } from "@/features/applications/agent-record";
import { recordApplication } from "@/features/applications/record-service";
import { normalizeJobUrl } from "@/features/jobs/import";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `agent-record-${randomUUID()}`;
const company = `Agent ${prefix}`;
const now = new Date("2026-10-30T10:00:00Z");
let counter = 0;
const opening = (patch: Record<string, unknown> = {}) => ({
  url: `https://jobs.fixture.invalid/${prefix}/${++counter}`,
  company,
  title: `Backend Engineer ${counter}`,
  ...patch,
});
const post = (open: Record<string, unknown>, application: Record<string, unknown> = {}) =>
  recordAgentApplication(
    { opening: open, application: { method: "DIRECT", ...application }, humanConfirmed: true },
    now,
  );
const job = async (url: string) =>
  (await db.select().from(jobs).where(eq(jobs.canonicalUrl, url)))[0];
const appsFor = async (url: string) =>
  db
    .select()
    .from(applications)
    .where(eq(applications.jobId, (await job(url)).id));

describe.skipIf(!dbTests)("agent application records", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    const owned = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(like(jobs.canonicalUrl, `https://jobs.fixture.invalid/${prefix}/%`));
    const ids = owned.map((row) => row.id);
    if (ids.length) {
      const apps = await db
        .select({ id: applications.id })
        .from(applications)
        .where(inArray(applications.jobId, ids));
      if (apps.length)
        await db.delete(activityLogs).where(
          inArray(
            activityLogs.entityId,
            apps.map((row) => row.id),
          ),
        );
      await db.delete(applications).where(inArray(applications.jobId, ids));
      await db.delete(jobs).where(inArray(jobs.id, ids));
    }
    await closeDatabase();
  });

  it("records a confirmed direct application", async () => {
    const open = opening({ postedAt: "2026-10-25" });
    const result = await post(open, { submittedAt: "2026-10-30" });
    expect(result).toMatchObject({
      duplicate: false,
      links: { application: `/applications/${result.id}`, company: null },
      warnings: ["No resume file recorded for this application."],
    });
    const [app] = await db.select().from(applications).where(eq(applications.id, result.id));
    expect(app.status).toBe("APPLIED");
    const [event] = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, result.id));
    expect(event).toMatchObject({
      eventType: "APPLICATION_SUBMITTED",
      payload: { humanConfirmed: true },
    });
    expect(await job(open.url)).toMatchObject({ status: "APPLIED", source: "AGENT_RECORD" });
  });

  it("repeat post returns duplicate", async () => {
    const open = opening();
    const first = await post(open);
    const second = await post(open);
    expect(second).toMatchObject({ id: first.id, duplicate: true });
    expect(await appsFor(open.url)).toHaveLength(1);
  });

  it("concurrent duplicate posts create one record", async () => {
    const open = opening();
    const results = await Promise.all([post(open), post(open)]);
    expect(results.filter((row) => row.duplicate)).toHaveLength(1);
    expect(results[0].id).toBe(results[1].id);
    expect(await appsFor(open.url)).toHaveLength(1);
  });

  it("stores posting provenance and backfills an undated opening", async () => {
    const open = opening();
    await post(open, { method: "REFERRAL" });
    expect((await job(open.url)).postedAt).toBeNull();
    await post(
      {
        ...open,
        postedAt: "2026-10-22",
        postedAtKind: "latest_publication",
        postedAtSourceUrl: "https://jobs.fixture.invalid/board",
      },
      { method: "DIRECT" },
    );
    expect(await job(open.url)).toMatchObject({
      postedAt: new Date("2026-10-22"),
      postedAtKind: "LATEST_PUBLICATION",
      postedAtSourceUrl: "https://jobs.fixture.invalid/board",
    });
  });

  it("does not replace an original date with a repost date", async () => {
    const open = opening({ postedAt: "2026-10-20", postedAtKind: "original" });
    await post(open, { method: "COLD_EMAIL" });
    await post({ ...open, postedAt: "2026-10-27", postedAtKind: "latest_publication" });
    expect(await job(open.url)).toMatchObject({
      postedAt: new Date("2026-10-20"),
      postedAtKind: "ORIGINAL",
    });
    const repost = opening({ postedAt: "2026-10-27", postedAtKind: "latest_publication" });
    await post(repost, { method: "COLD_EMAIL" });
    await post({ ...repost, postedAt: "2026-10-19", postedAtKind: "original" });
    expect(await job(repost.url)).toMatchObject({
      postedAt: new Date("2026-10-19"),
      postedAtKind: "ORIGINAL",
    });
  });

  it("upgrades a planned record instead of reporting a duplicate", async () => {
    const open = opening();
    const [stored] = await db
      .insert(jobs)
      .values({
        company,
        title: open.title,
        canonicalUrl: normalizeJobUrl(open.url),
        dedupeKey: `${prefix}-planned`,
        source: "MANUAL",
      })
      .returning();
    const planned = await db.transaction((tx) =>
      recordApplication(tx, {
        recordId: null,
        jobId: stored.id,
        versionId: null,
        method: "DIRECT",
        state: "planned",
        notes: "",
        recipient: "",
        url: "",
        sentAt: null,
      }),
    );
    const result = await post(open);
    expect(result).toMatchObject({ id: planned, duplicate: false });
    const [app] = await db.select().from(applications).where(eq(applications.id, planned));
    expect(app.status).toBe("APPLIED");
    expect(await appsFor(open.url)).toHaveLength(1);
  });

  it("refuses a missing resume file or future date with 409, not a server error", async () => {
    await expect(
      post(opening(), { resumeVersionId: "99999999-9999-4999-8999-999999999999" }),
    ).rejects.toMatchObject({ status: 409, message: "Choose an existing resume file." });
    await expect(post(opening(), { submittedAt: "2099-01-01" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("finds the record by url and by company", async () => {
    const open = opening();
    const { id } = await post(open);
    expect((await findApplications({ url: open.url })).map((row) => row.id)).toEqual([id]);
    const byCompany = await findApplications({ company: company.toUpperCase() });
    expect(byCompany.map((row) => row.id)).toContain(id);
    expect(byCompany.find((row) => row.id === id)).toMatchObject({
      company,
      method: "DIRECT",
      status: "APPLIED",
      url: open.url,
    });
    await expect(findApplications({})).rejects.toMatchObject({ status: 400 });
  });
});
