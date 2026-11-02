import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { jobs, jobSnapshots, jobTermLists, resumeAssessments, resumeVersions } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { istDaysBetween } from "@/features/applications/dates";
import { indiaDate } from "@/features/mail/attention";

export type ScorableOpening = {
  jobId: string;
  snapshotId: string;
  company: string;
  title: string;
  location: string;
  reqId: string | null;
  postedAt: string | null;
  postedAtKind: string | null;
  tailored: boolean;
  scored: boolean;
  fresh: boolean;
  dateUnknown: boolean;
  reviewed: boolean;
};

const FRESH_DAYS = 14;

/**
 * Saved openings a file can be scored against: each job's latest description, except the job the
 * file was tailored for, which keeps the exact description it was tailored to.
 */
export async function listScorableOpenings(
  versionId: string,
  now = new Date(),
): Promise<ScorableOpening[]> {
  const [version] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, versionId));
  if (!version) throw new ApiError("Unknown résumé file.", 404);

  const latest = await db
    .selectDistinctOn([jobSnapshots.jobId], {
      jobId: jobSnapshots.jobId,
      snapshotId: jobSnapshots.id,
    })
    .from(jobSnapshots)
    .where(ne(jobSnapshots.description, ""))
    .orderBy(jobSnapshots.jobId, desc(jobSnapshots.capturedAt), desc(jobSnapshots.id));
  const snapshotOf = new Map(latest.map((s) => [s.jobId, s.snapshotId]));
  if (version.targetJobId && version.targetSnapshotId)
    snapshotOf.set(version.targetJobId, version.targetSnapshotId);
  if (!snapshotOf.size) return [];

  const jobIds = [...snapshotOf.keys()];
  const snapshotIds = [...snapshotOf.values()];
  const [rows, scoredJobs, reviewedLists, recordedLexical] = await Promise.all([
    db.select().from(jobs).where(inArray(jobs.id, jobIds)),
    db
      .selectDistinct({ jobId: jobSnapshots.jobId })
      .from(resumeAssessments)
      .innerJoin(jobSnapshots, eq(jobSnapshots.id, resumeAssessments.snapshotId))
      .where(eq(resumeAssessments.versionId, versionId)),
    db
      .select({ snapshotId: jobTermLists.snapshotId })
      .from(jobTermLists)
      .where(inArray(jobTermLists.snapshotId, snapshotIds)),
    // A snapshot an agent already scored is seeded into a term list on first use.
    db
      .selectDistinct({ snapshotId: resumeAssessments.snapshotId })
      .from(resumeAssessments)
      .where(
        and(
          inArray(resumeAssessments.snapshotId, snapshotIds),
          eq(resumeAssessments.source, "jobops-lexical"),
        ),
      ),
  ]);
  const scored = new Set(scoredJobs.map((r) => r.jobId));
  const reviewed = new Set([
    ...reviewedLists.map((r) => r.snapshotId),
    ...recordedLexical.map((r) => r.snapshotId),
  ]);

  return rows
    .map((job) => {
      const snapshotId = snapshotOf.get(job.id)!;
      return {
        jobId: job.id,
        snapshotId,
        company: job.company,
        title: job.title,
        location: job.location,
        reqId: job.externalId,
        postedAt: job.postedAt ? indiaDate(job.postedAt) : null,
        postedAtKind: job.postedAtKind,
        tailored: job.id === version.targetJobId,
        scored: scored.has(job.id),
        fresh: job.postedAt != null && istDaysBetween(job.postedAt, now) <= FRESH_DAYS,
        dateUnknown: job.postedAt == null,
        reviewed: reviewed.has(snapshotId),
        sortAt: job.postedAt?.getTime() ?? null,
      };
    })
    .sort((a, b) =>
      a.sortAt === b.sortAt
        ? 0
        : a.sortAt === null
          ? 1
          : b.sortAt === null
            ? -1
            : b.sortAt - a.sortAt,
    )
    .map(({ sortAt: _, ...opening }) => opening);
}
