import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  activityLogs,
  jobs,
  jobSnapshots,
  jobTermLists,
  resumeAssessments,
  resumes,
  resumeVersions,
  settings,
} from "@/db/schema";
import { fitInputSchema, recordFit } from "@/features/resumes/fit/service";
import { backfillTermFingerprints, TERM_FINGERPRINT_KEY } from "@/features/resumes/score/backfill";
import {
  getTermList,
  saveTermList,
  termsFingerprint,
  type ReviewedTerm,
} from "@/features/resumes/score/terms";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `resume-terms-${randomUUID()}`;
const families: string[] = [];
let counter = 0;

async function version() {
  const [resume] = await db
    .insert(resumes)
    .values({ name: `Terms ${prefix}`, slug: `${prefix}-${++counter}` })
    .returning({ id: resumes.id });
  families.push(resume.id);
  const [row] = await db
    .insert(resumeVersions)
    .values({
      resumeId: resume.id,
      versionLabel: `File ${counter}`,
      originalFilename: "synthetic.pdf",
      storagePath: `${prefix}/${counter}.pdf`,
      fileSize: 100,
      sha256: `${prefix}-${counter}`,
      extractedText: "Asha Example\nBuilt Java services.",
      parsingStatus: "COMPLETED",
    })
    .returning({ id: resumeVersions.id });
  return row.id;
}

const requirement = (term: string, importance: "required" | "preferred") => ({
  term,
  aliases: [],
  importance,
  jd_quote: "We need Java and Kafka.",
});
const lexical = (reqs: ReturnType<typeof requirement>[]) => ({
  keyword: 50,
  required: 50,
  preferred: 50,
  weighted: 50,
  engineVersion: "1.0.0",
  requirements: reqs,
  findings: reqs.map((r) => ({
    term: r.term,
    aliases: [],
    importance: r.importance,
    status: "not_evidenced",
    resume_evidence: [],
  })),
});
const resumeNext = {
  ats_score: 70,
  grade: "B",
  grade_label: "Good",
  categories: [],
  issues: [],
  keyword_coverage: { coverage_percent: 50, matched: [], missing: [] },
  keywords: [],
  resume: {},
};
let urls = 0;
async function fit(versionId: string, reqs: ReturnType<typeof requirement>[], url?: string) {
  return recordFit(
    versionId,
    fitInputSchema.parse({
      target: {
        url: url ?? `https://jobs.fixture.invalid/${prefix}/${++urls}`,
        company: `Terms Co ${prefix}`,
        title: "Software Engineer",
        reqId: `R-${prefix}-${url ? "same" : urls}`,
        description: "We need Java and Kafka.",
      },
      assessments: [
        {
          versionId,
          source: "jobops-lexical",
          method: "m",
          score: 50,
          details: lexical(reqs),
        },
        { versionId, source: "resumenext", method: "m", score: 70, details: resumeNext },
      ],
    }),
  );
}
const reviewed = (term: string, importance: ReviewedTerm["importance"]): ReviewedTerm => ({
  term,
  aliases: [],
  importance,
  jdQuote: "We need Java and Kafka.",
});

describe.skipIf(!dbTests)("reviewed term lists", () => {
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

  it("seeds from the latest recorded lexical requirements", async () => {
    const id = await version();
    const { snapshotId } = await fit(id, [requirement("Java", "required")]);
    await db.delete(jobTermLists).where(eq(jobTermLists.snapshotId, snapshotId));
    const list = await getTermList(snapshotId);
    expect(list?.reviewedBy).toBe("agent");
    expect(list?.terms).toEqual([reviewed("Java", "required")]);
    const [row] = await db
      .select()
      .from(jobTermLists)
      .where(eq(jobTermLists.snapshotId, snapshotId));
    expect(row.fingerprint).toBe(termsFingerprint([reviewed("Java", "required")]));
  });

  it("returns null for a snapshot nobody reviewed", async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        canonicalUrl: `https://jobs.fixture.invalid/${prefix}/blank`,
        dedupeKey: `${prefix}-blank`,
        company: "Blank Co",
        title: "Engineer",
        source: "TEST",
      })
      .returning({ id: jobs.id });
    const [snapshot] = await db
      .insert(jobSnapshots)
      .values({ jobId: job.id, description: "We need Go." })
      .returning({ id: jobSnapshots.id });
    expect(await getTermList(snapshot.id)).toBeNull();
  });

  it("saveTermList upserts and recordFit with lexical requirements replaces the list as agent", async () => {
    const id = await version();
    const url = `https://jobs.fixture.invalid/${prefix}/shared`;
    const { snapshotId } = await fit(id, [requirement("Java", "required")], url);
    const mine = [reviewed("Java", "required"), reviewed("Kafka", "skip")];
    const saved = await saveTermList(snapshotId, mine, "user");
    expect((await getTermList(snapshotId))?.reviewedBy).toBe("user");
    expect(saved.fingerprint).toBe(termsFingerprint(mine));

    await fit(id, [requirement("Java", "required"), requirement("Kafka", "preferred")], url);
    const list = await getTermList(snapshotId);
    expect(list?.reviewedBy).toBe("agent");
    expect(list?.terms.map((t) => [t.term, t.importance])).toEqual([
      ["Java", "required"],
      ["Kafka", "preferred"],
    ]);
  });

  it("recordFit stamps termsFingerprint on every recorded row", async () => {
    const id = await version();
    const reqs = [requirement("Java", "required")];
    const { snapshotId } = await fit(id, reqs);
    const rows = await db
      .select()
      .from(resumeAssessments)
      .where(
        and(eq(resumeAssessments.versionId, id), eq(resumeAssessments.snapshotId, snapshotId)),
      );
    expect(rows).toHaveLength(2);
    const expected = termsFingerprint([reviewed("Java", "required")]);
    for (const row of rows) expect(row.details.termsFingerprint).toBe(expected);
  });

  it("backfill stamps rows recorded together and runs once", async () => {
    const id = await version();
    const { snapshotId } = await fit(id, [requirement("Java", "required")]);
    // Simulate rows recorded before fingerprints existed.
    const rows = await db
      .select()
      .from(resumeAssessments)
      .where(eq(resumeAssessments.versionId, id));
    for (const row of rows) {
      const { termsFingerprint: _, ...details } = row.details;
      await db.update(resumeAssessments).set({ details }).where(eq(resumeAssessments.id, row.id));
    }
    await db.delete(settings).where(eq(settings.key, TERM_FINGERPRINT_KEY));

    expect((await backfillTermFingerprints()).skipped).toBe(false);
    const stamped = await db
      .select()
      .from(resumeAssessments)
      .where(eq(resumeAssessments.versionId, id));
    const expected = termsFingerprint([reviewed("Java", "required")]);
    for (const row of stamped) expect(row.details.termsFingerprint).toBe(expected);

    await db.insert(resumeAssessments).values({
      versionId: id,
      snapshotId,
      source: "resumenext",
      method: "m",
      score: 1,
      assessedAt: new Date("2026-11-02T00:00:00Z"),
      details: resumeNext,
    });
    expect((await backfillTermFingerprints()).skipped).toBe(true);
  });
});
