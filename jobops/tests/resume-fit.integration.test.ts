import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { activityLogs, jobs, resumeAssessments, resumes, resumeVersions } from "@/db/schema";
import { fitInputSchema, getFit, recordFit } from "@/features/resumes/fit/service";
import { termsFingerprint } from "@/features/resumes/score/terms";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { GET, POST } from "@/app/api/v1/resumes/[versionId]/fit/route";

const prefix = `resume-fit-${randomUUID()}`;
const now = new Date("2026-11-02T10:00:00Z");
const families: string[] = [];
let counter = 0;

async function family() {
  const [resume] = await db
    .insert(resumes)
    .values({ name: `Fit ${prefix}`, slug: `${prefix}-${++counter}` })
    .returning({ id: resumes.id });
  families.push(resume.id);
  return resume.id;
}
async function version(resumeId: string, patch: Partial<typeof resumeVersions.$inferInsert> = {}) {
  const [row] = await db
    .insert(resumeVersions)
    .values({
      resumeId,
      versionLabel: `File ${++counter}`,
      originalFilename: "synthetic.pdf",
      storagePath: `${prefix}/${counter}.pdf`,
      fileSize: 100,
      sha256: `${prefix}-${counter}`,
      extractedText: "Asha Example\nBackend Engineer\nPROFESSIONAL SUMMARY\nBuilds services.",
      parsingStatus: "COMPLETED",
      ...patch,
    })
    .returning({ id: resumeVersions.id });
  return row.id;
}

const lexical = (weighted: number) => ({
  keyword: weighted,
  required: weighted,
  preferred: weighted,
  weighted,
  engineVersion: "lexical-test",
  requirements: [{ term: "Java", aliases: [], importance: "required", jd_quote: "Java." }],
  findings: [
    {
      term: "Java",
      aliases: [],
      importance: "required",
      status: "mentioned",
      resume_evidence: [{ start: 0, end: 4, text: "Java", context: "Built Java services." }],
    },
  ],
});
const assessment = (versionId: string, score: number) => ({
  versionId,
  source: "jobops-lexical",
  method: "lexical-test",
  score,
  findings: `${score}% weighted`,
  details: lexical(score),
});
const record = (id: string, body: unknown, at = now) =>
  recordFit(id, fitInputSchema.parse(body), at);
let urls = 0;
const target = (patch: Record<string, unknown> = {}) => ({
  url: `https://jobs.fixture.invalid/${prefix}/${++urls}`,
  company: `Fit Co ${prefix}`,
  title: "Software Engineer III",
  location: "Bengaluru",
  reqId: `R-${urls}`,
  postedAt: "2026-10-30",
  postedAtKind: "latest_publication" as const,
  description: "We need Java services.",
  ...patch,
});

describe.skipIf(!dbTests)("résumé fit records", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    const versions = await db
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(inArray(resumeVersions.resumeId, families));
    const ids = versions.map((v) => v.id);
    if (ids.length) {
      await db.delete(resumeAssessments).where(inArray(resumeAssessments.versionId, ids));
      await db.delete(activityLogs).where(inArray(activityLogs.entityId, ids));
      await db
        .update(resumeVersions)
        .set({ baseVersionId: null })
        .where(inArray(resumeVersions.id, ids));
      await db.delete(resumeVersions).where(inArray(resumeVersions.id, ids));
    }
    if (families.length) await db.delete(resumes).where(inArray(resumes.id, families));
    const owned = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(like(jobs.canonicalUrl, `https://jobs.fixture.invalid/${prefix}/%`));
    if (owned.length) {
      const jobIds = owned.map((j) => j.id);
      await db.delete(activityLogs).where(inArray(activityLogs.entityId, jobIds));
      await db.delete(jobs).where(inArray(jobs.id, jobIds));
    }
    await closeDatabase();
  });

  it("records target, snapshot and assessments for both versions", async () => {
    const resumeId = await family();
    const base = await version(resumeId);
    const mine = await version(resumeId);
    const t = target();
    const result = await record(
      mine,
      {
        baseVersionId: base,
        target: t,
        assessments: [assessment(mine, 61.1), assessment(base, 50)],
      },
      now,
    );
    expect(result).toMatchObject({ versionId: mine, recorded: 2 });
    const fit = await getFit(mine);
    expect(fit).toMatchObject({
      versionId: mine,
      baseVersionId: base,
      target: {
        jobId: result.jobId,
        company: t.company,
        title: "Software Engineer III",
        reqId: t.reqId,
        postedAt: "2026-10-30",
        postedAtKind: "LATEST_PUBLICATION",
      },
      snapshot: { id: result.snapshotId, description: "We need Java services." },
    });
    expect(fit?.mine["jobops-lexical"]?.score).toBe(61.1);
    expect(fit?.base["jobops-lexical"]?.score).toBe(50);
    expect((await getFit(base))?.derivedFrom).toEqual([
      { id: mine, label: expect.stringMatching(/^File \d+$/) },
    ]);
    const [log] = await db.select().from(activityLogs).where(eq(activityLogs.entityId, mine));
    expect(log.action).toBe("RESUME_FIT_RECORDED");
  });

  it("serves a brief that starts from the current résumé", async () => {
    const resumeId = await family();
    const base = await version(resumeId);
    const mine = await version(resumeId);
    await record(
      mine,
      { baseVersionId: base, target: target(), assessments: [assessment(mine, 61.1)] },
      now,
    );
    const fit = (await getFit(mine))!;
    expect(fit.brief?.startFrom.versionId).toBe(base);
    expect(fit.brief?.revision?.versionId).toBe(mine);
    expect(fit.groups[0].brief).toEqual(fit.brief);
    expect(fit.brief?.scores.keywordCheck.revised).toBe(61.1);
  });

  it("records the editable DOCX path on the posted version", async () => {
    const resumeId = await family();
    const mine = await version(resumeId);
    await record(mine, { target: target(), assessments: [], docxPath: "/r/Revised.docx" }, now);
    const [row] = await db
      .select({ docxPath: resumeVersions.docxPath })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, mine));
    expect(row.docxPath).toBe("/r/Revised.docx");
  });

  it("re-recording the same target appends and keeps the latest", async () => {
    const resumeId = await family();
    const mine = await version(resumeId);
    const t = target();
    await record(mine, { target: t, assessments: [assessment(mine, 40)] }, now);
    await record(mine, { target: t, assessments: [assessment(mine, 70)] }, now);
    expect((await getFit(mine))?.mine["jobops-lexical"]?.score).toBe(70);
    const rows = await db
      .select()
      .from(resumeAssessments)
      .where(eq(resumeAssessments.versionId, mine));
    expect(rows).toHaveLength(2);
  });

  it("refuses a different target with 409 and the exact message", async () => {
    const resumeId = await family();
    const mine = await version(resumeId);
    const first = target({ company: "Walmart Fixture" });
    await record(mine, { target: first, assessments: [] }, now);
    await expect(record(mine, { target: target(), assessments: [] }, now)).rejects.toMatchObject({
      status: 409,
      message: "This file is already tailored for Walmart Fixture · Software Engineer III",
    });
  });

  it("refuses a base from another family (409) and an assessment for a third version (422)", async () => {
    const mine = await version(await family());
    const stranger = await version(await family());
    await expect(
      record(mine, { baseVersionId: stranger, target: target(), assessments: [] }, now),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      record(mine, { baseVersionId: mine, target: target(), assessments: [] }, now),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      record(mine, { target: target(), assessments: [assessment(stranger, 10)] }, now),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("refuses an unparsed version (422)", async () => {
    const mine = await version(await family(), { parsingStatus: "FAILED" });
    await expect(record(mine, { target: target(), assessments: [] }, now)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("refuses an unknown version (404)", async () =>
    expect(record(randomUUID(), { target: target(), assessments: [] }, now)).rejects.toMatchObject({
      status: 404,
    }));

  it("stores a 100000-character description whole", async () => {
    const mine = await version(await family());
    const description = "Java ".repeat(20000);
    await record(mine, { target: target({ description }), assessments: [] }, now);
    expect((await getFit(mine))?.snapshot?.description).toHaveLength(100000);
  });

  it("two Walmart-like targets on two files stay two jobs", async () => {
    const resumeId = await family();
    const [a, b] = [await version(resumeId), await version(resumeId)];
    const shared = { company: `Walmart ${prefix}`, title: "Software Engineer III" };
    const one = await record(
      a,
      { target: target({ ...shared, reqId: "R-2694949" }), assessments: [] },
      now,
    );
    const two = await record(
      b,
      { target: target({ ...shared, reqId: "R-2655406" }), assessments: [] },
      now,
    );
    expect(one.jobId).not.toBe(two.jobId);
  });

  it("the route caps the body at 1 MB and answers 404 for unknown files", async () => {
    const id = randomUUID();
    const params = { params: Promise.resolve({ versionId: id }) };
    const big = new Request(`http://localhost/api/v1/resumes/${id}/fit`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(1024 * 1024 + 1) },
      body: "{}",
    });
    expect((await POST(big, params)).status).toBe(413);
    const missing = await GET(new Request(`http://localhost/api/v1/resumes/${id}/fit`), params);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Unknown résumé file." });
  });

  it("getFit groups every snapshot the file was scored against", async () => {
    const resumeId = await family();
    const base = await version(resumeId);
    const mine = await version(resumeId);
    const tailored = await record(
      mine,
      { baseVersionId: base, target: target(), assessments: [assessment(mine, 56)] },
      now,
    );
    const other = await record(
      await version(resumeId),
      { target: target({ company: `Other Co ${prefix}` }), assessments: [] },
      now,
    );
    const fingerprint = termsFingerprint([
      { term: "Java", aliases: [], importance: "required", jdQuote: "Java." },
    ]);
    for (const [versionId, score] of [
      [mine, 58],
      [base, 61],
    ] as const)
      await db.insert(resumeAssessments).values({
        versionId,
        snapshotId: other.snapshotId,
        source: "jobops-lexical",
        method: "weighted_coverage@1.1.0, run in JobOps",
        score,
        assessedAt: now,
        details: { ...lexical(score), termsFingerprint: fingerprint },
      });
    const fit = (await getFit(mine))!;
    expect(fit.groups.map((g) => [g.snapshotId, g.tailored])).toEqual([
      [tailored.snapshotId, true],
      [other.snapshotId, false],
    ]);
    expect(fit.groups[1].mine["jobops-lexical"]?.score).toBe(58);
    expect(fit.groups[1].base["jobops-lexical"]?.score).toBe(61);
    expect(fit.groups[1].target.company).toBe(`Other Co ${prefix}`);
    expect(fit.groups[1].earlierDescription).toBe(false);
  });
});
