import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  activityLogs,
  jobs,
  jobSnapshots,
  resumeAssessments,
  resumes,
  resumeVersions,
} from "@/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/storage", () => ({
  readBuffer: vi.fn(async (path: string) => {
    if (path.includes("missing")) throw new Error("Stored file is unavailable.");
    return Buffer.from("%PDF-1.4 synthetic");
  }),
}));
const lexicalCall = vi.fn();
vi.mock("@/features/resumes/score/scoring-client", async (original) => ({
  ...(await original<object>()),
  assessLexical: (...args: unknown[]) => lexicalCall(...args),
  assessOptimizer: vi.fn(),
  suggestTerms: vi.fn(),
}));
vi.mock("@/features/resumes/score/resumenext-client", async (original) => ({
  ...(await original<object>()),
  matchResumeToJob: vi.fn(),
}));

import { fitInputSchema, recordFit } from "@/features/resumes/fit/service";
import { matchResumeToJob } from "@/features/resumes/score/resumenext-client";
import { listScorableOpenings } from "@/features/resumes/score/openings";
import { scoreVersion } from "@/features/resumes/score/run";
import { saveTermList, termsFingerprint, type ReviewedTerm } from "@/features/resumes/score/terms";
import { ToolError } from "@/features/resumes/score/tool-error";
import { POST as scoreRoute } from "@/app/api/v1/resumes/[versionId]/score/route";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `resume-score-${randomUUID()}`;
const families: string[] = [];
let counter = 0;
const now = new Date("2026-11-02T10:00:00Z");
const JD = "We need Java and Kafka.";

const assessment = (weighted: number) => ({
  engine_version: "1.1.0",
  status: "completed",
  scores: [
    { id: "keyword_coverage", value: weighted },
    { id: "required_coverage", value: weighted },
    { id: "preferred_coverage", value: weighted },
    { id: "weighted_coverage", value: weighted },
  ],
  findings: [
    { term: "Java", aliases: [], importance: "required", status: "mentioned", resume_evidence: [] },
  ],
});
const java: ReviewedTerm = { term: "Java", aliases: [], importance: "required", jdQuote: JD };
const kafka: ReviewedTerm = { term: "Kafka", aliases: [], importance: "preferred", jdQuote: JD };

async function family() {
  const [resume] = await db
    .insert(resumes)
    .values({ name: `Score ${prefix}`, slug: `${prefix}-${++counter}` })
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
      originalFilename: "Asha_Example_Resume.pdf",
      storagePath: `${prefix}/${counter}.pdf`,
      fileSize: 100,
      sha256: `${prefix}-${counter}`,
      extractedText: "Asha Example\nBuilt Java services.",
      parsingStatus: "COMPLETED",
      ...patch,
    })
    .returning({ id: resumeVersions.id });
  return row.id;
}
async function pair(patch: Partial<typeof resumeVersions.$inferInsert> = {}) {
  const resumeId = await family();
  const base = await version(resumeId);
  const mine = await version(resumeId, { baseVersionId: base, ...patch });
  return { base, mine };
}
let jobCount = 0;
async function opening(postedAt: Date | null = new Date("2026-10-30T00:00:00Z")) {
  const [job] = await db
    .insert(jobs)
    .values({
      canonicalUrl: `https://jobs.fixture.invalid/${prefix}/${++jobCount}`,
      dedupeKey: `${prefix}-${jobCount}`,
      company: `Score Co ${jobCount}`,
      title: "Software Engineer",
      source: "TEST",
      postedAt,
    })
    .returning({ id: jobs.id });
  const [snapshot] = await db
    .insert(jobSnapshots)
    .values({ jobId: job.id, description: JD })
    .returning({ id: jobSnapshots.id });
  return { jobId: job.id, snapshotId: snapshot.id };
}
const rowsFor = (versionId: string, snapshotId: string) =>
  db
    .select()
    .from(resumeAssessments)
    .where(
      and(eq(resumeAssessments.versionId, versionId), eq(resumeAssessments.snapshotId, snapshotId)),
    );

describe.skipIf(!dbTests)("scoring a résumé file against a saved opening", () => {
  beforeAll(assertE2eDatabase);
  beforeEach(() => {
    lexicalCall.mockReset();
    lexicalCall.mockResolvedValue(assessment(60));
  });
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
        .set({ baseVersionId: null, targetJobId: null, targetSnapshotId: null })
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

  it("scores the file and the base against the snapshot with one fingerprint", async () => {
    const { base, mine } = await pair();
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java, kafka], "user");
    const result = await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    const fingerprint = termsFingerprint([java, kafka]);
    expect(result.mine.score).toBe(60);
    expect(result.mine.method).toBe("weighted_coverage@1.1.0, run in JobOps");
    expect(result.base?.versionId).toBe(base);
    for (const id of [mine, base]) {
      const rows = await rowsFor(id, snapshotId);
      expect(rows).toHaveLength(1);
      expect(rows[0].details.termsFingerprint).toBe(fingerprint);
    }
    expect(lexicalCall).toHaveBeenCalledTimes(2);
  });

  it("reuses the base row when fingerprint and engine version match", async () => {
    const { base, mine } = await pair();
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    expect(await rowsFor(base, snapshotId)).toHaveLength(1);
    expect(await rowsFor(mine, snapshotId)).toHaveLength(2);
    expect(lexicalCall).toHaveBeenCalledTimes(3);
  });

  it("re-scores the base after terms change", async () => {
    const { base, mine } = await pair();
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    await saveTermList(snapshotId, [java, { ...kafka, importance: "required" }], "user");
    await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    expect(await rowsFor(base, snapshotId)).toHaveLength(2);
  });

  it("never changes targetJobId, targetSnapshotId or baseVersionId", async () => {
    const { base, mine } = await pair();
    const tailored = await recordFit(
      mine,
      fitInputSchema.parse({
        target: {
          url: `https://jobs.fixture.invalid/${prefix}/tailored`,
          company: "Tailored Co",
          title: "Engineer",
          description: JD,
        },
        assessments: [],
      }),
    );
    const other = await opening();
    await saveTermList(other.snapshotId, [java], "user");
    await scoreVersion(mine, other.snapshotId, "jobops-lexical", now);
    const [row] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, mine));
    expect(row).toMatchObject({
      baseVersionId: base,
      targetJobId: tailored.jobId,
      targetSnapshotId: tailored.snapshotId,
    });
  });

  it("concurrent runs save one base row", async () => {
    const { base, mine } = await pair();
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    await Promise.all([
      scoreVersion(mine, snapshotId, "jobops-lexical", now),
      scoreVersion(mine, snapshotId, "jobops-lexical", now),
    ]);
    expect(await rowsFor(base, snapshotId)).toHaveLength(1);
  });

  it("missing PDF fails only that tool", async () => {
    const { mine } = await pair({ storagePath: `${prefix}/missing.pdf` });
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    const error = await scoreVersion(mine, snapshotId, "jobops-lexical", now).catch((e) => e);
    expect(error).toBeInstanceOf(ToolError);
    expect(error.code).toBe("missing_pdf");
    expect(await rowsFor(mine, snapshotId)).toHaveLength(0);
  });

  it("a base that fails still saves the file row", async () => {
    const resumeId = await family();
    const base = await version(resumeId, { storagePath: `${prefix}/missing-base.pdf` });
    const mine = await version(resumeId, { baseVersionId: base });
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    const result = await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    expect(result.baseSkipped).toBe("failed");
    expect(result.baseError).toBe("The PDF for this file is missing from storage");
    expect(result.base).toBeNull();
    expect(await rowsFor(mine, snapshotId)).toHaveLength(1);
    expect(await rowsFor(base, snapshotId)).toHaveLength(0);
  });

  it("tools run with no database transaction open", async () => {
    const { mine } = await pair();
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    const open: number[] = [];
    lexicalCall.mockImplementation(async () => {
      const { rows } = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from pg_stat_activity
            where datname = current_database() and state like 'idle in transaction%'`,
      );
      open.push(rows[0].n);
      return assessment(60);
    });
    await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    expect(open).toEqual([0, 0]);
  });

  it("base without text is skipped", async () => {
    const resumeId = await family();
    const base = await version(resumeId, { parsingStatus: "PENDING", extractedText: "" });
    const mine = await version(resumeId, { baseVersionId: base });
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    const result = await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    expect(result.baseSkipped).toBe("no_text");
    expect(result.base).toBeNull();
    expect(await rowsFor(mine, snapshotId)).toHaveLength(1);
  });

  it("refuses with 409 without a term list", async () => {
    const { mine } = await pair();
    const { snapshotId } = await opening();
    const response = await scoreRoute(
      new Request("http://local/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId, tool: "jobops-lexical" }),
      }),
      { params: Promise.resolve({ versionId: mine }) },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("Review this job's terms first.");
  });

  it("reports a tool failure as 502 with its code", async () => {
    const { mine } = await pair({ storagePath: `${prefix}/missing.pdf` });
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java], "user");
    const response = await scoreRoute(
      new Request("http://local/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId, tool: "jobops-lexical" }),
      }),
      { params: Promise.resolve({ versionId: mine }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The PDF for this file is missing from storage",
      code: "missing_pdf",
    });
  });

  it("lexical row copies notes from the latest noted row for the file and snapshot", async () => {
    const { mine } = await pair();
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java, kafka], "user");
    await db.insert(resumeAssessments).values({
      versionId: mine,
      snapshotId,
      source: "jobops-lexical",
      method: "agent",
      score: 10,
      assessedAt: now,
      details: {
        keyword: 10,
        required: 10,
        preferred: 10,
        weighted: 10,
        engineVersion: "1.0.0",
        requirements: [
          { term: "Kafka", aliases: [], importance: "preferred", jd_quote: JD, note: "Never used" },
        ],
        findings: [],
      },
    });
    const result = await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    const details = result.mine.details as { requirements: { term: string; note?: string }[] };
    expect(details.requirements.find((r) => r.term === "Kafka")?.note).toBe("Never used");
  });

  it("a new version with no rows of its own inherits its base's notes and decisions", async () => {
    const { base, mine } = await pair();
    const { snapshotId } = await opening();
    await saveTermList(snapshotId, [java, kafka], "user");
    const rn = (decision?: string) => ({
      ats_score: 70,
      grade: "C",
      grade_label: "SATISFACTORY",
      categories: [],
      issues: [
        {
          label: "Action verbs",
          hint: "h",
          severity: "important",
          ...(decision ? { decision } : {}),
        },
      ],
      keyword_coverage: { coverage_percent: 40, matched: [], missing: [] },
      keywords: [],
      resume: {},
    });
    await db.insert(resumeAssessments).values([
      {
        versionId: base,
        snapshotId,
        source: "jobops-lexical",
        method: "agent",
        score: 10,
        assessedAt: now,
        details: {
          keyword: 10,
          required: 10,
          preferred: 10,
          weighted: 10,
          engineVersion: "1.0.0",
          requirements: [
            {
              term: "Kafka",
              aliases: [],
              importance: "preferred",
              jd_quote: JD,
              note: "Never used",
            },
          ],
          findings: [],
        },
      },
      {
        versionId: base,
        snapshotId,
        source: "resumenext",
        method: "agent",
        score: 70,
        assessedAt: now,
        details: rn("Present tense on purpose"),
      },
    ]);
    const lexical = await scoreVersion(mine, snapshotId, "jobops-lexical", now);
    const notes = lexical.mine.details as { requirements: { term: string; note?: string }[] };
    expect(notes.requirements.find((r) => r.term === "Kafka")?.note).toBe("Never used");
    vi.mocked(matchResumeToJob).mockResolvedValue(rn());
    const resumenext = await scoreVersion(mine, snapshotId, "resumenext", now);
    const issues = (resumenext.mine.details as { issues: { decision?: string }[] }).issues;
    expect(issues[0].decision).toBe("Present tense on purpose");
  });

  it("openings flag tailored, scored, over 14 days and unknown date; tailored uses targetSnapshotId", async () => {
    const { mine } = await pair();
    const tailored = await recordFit(
      mine,
      fitInputSchema.parse({
        target: {
          url: `https://jobs.fixture.invalid/${prefix}/tailored-openings`,
          company: "Tailored Openings Co",
          title: "Engineer",
          description: JD,
        },
        assessments: [],
      }),
    );
    // A newer description for the tailored job must not replace the file's own snapshot.
    await db.insert(jobSnapshots).values({
      jobId: tailored.jobId,
      description: "Changed description.",
      capturedAt: new Date("2026-11-03T00:00:00Z"),
    });
    const fresh = await opening(new Date("2026-10-30T00:00:00Z"));
    const stale = await opening(new Date("2026-10-01T00:00:00Z"));
    const undated = await opening(null);
    await saveTermList(fresh.snapshotId, [java], "user");
    await scoreVersion(mine, fresh.snapshotId, "jobops-lexical", now);

    const list = await listScorableOpenings(mine, now);
    const byJob = Object.fromEntries(list.map((o) => [o.jobId, o]));
    expect(byJob[tailored.jobId]).toMatchObject({
      tailored: true,
      snapshotId: tailored.snapshotId,
    });
    expect(byJob[fresh.jobId]).toMatchObject({ scored: true, fresh: true, reviewed: true });
    expect(byJob[stale.jobId]).toMatchObject({ fresh: false, dateUnknown: false, scored: false });
    expect(byJob[undated.jobId]).toMatchObject({ fresh: false, dateUnknown: true });
    const ids = list.map((o) => o.jobId);
    expect(ids.indexOf(fresh.jobId)).toBeLessThan(ids.indexOf(stale.jobId));
    expect(ids.indexOf(stale.jobId)).toBeLessThan(ids.indexOf(undated.jobId));
  });
});
