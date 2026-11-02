import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, jobSnapshots, jobs, resumeAssessments, resumeVersions } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { day, httpUrl } from "@/features/applications/agent-record";
import { jobInputSchema } from "@/features/jobs/import";
import { importJobRows } from "@/features/jobs/service";
import { indiaDate, indiaDayBoundary } from "@/features/mail/attention";
import { deriveChips, latestBySource, parseToolRow, type Chip, type ParsedRow } from "./derive";
import {
  TOOL_SOURCES,
  toolDetailsSchema,
  type LexicalDetails,
  type OptimizerDetails,
  type ToolSource,
} from "./tools";

/** Record-only: the agent ran the checks; JobOps stores the target, snapshot and results. */
export const fitInputSchema = z
  .strictObject({
    baseVersionId: z.uuid().optional(),
    target: z.strictObject({
      url: httpUrl,
      company: z.string().trim().min(1).max(200),
      title: z.string().trim().min(1).max(300),
      location: z.string().trim().max(300).optional(),
      reqId: z.string().trim().min(1).max(200).optional(),
      postedAt: day.optional(),
      postedAtKind: z.enum(["original", "latest_publication"]).optional(),
      postedAtSourceUrl: httpUrl.optional(),
      description: z.string().min(1).max(100000),
    }),
    assessments: z
      .array(
        z.strictObject({
          versionId: z.uuid(),
          source: z.enum(TOOL_SOURCES),
          method: z.string().trim().min(1).max(5000),
          score: z.number().finite().min(0).max(100).nullable(),
          findings: z.string().trim().max(20000).default(""),
          details: z.record(z.string(), z.unknown()),
        }),
      )
      .max(30),
  })
  .superRefine((input, ctx) =>
    input.assessments.forEach((a, i) => {
      const parsed = toolDetailsSchema[a.source].safeParse(a.details);
      if (!parsed.success)
        for (const issue of parsed.error.issues)
          ctx.addIssue({
            code: "custom",
            path: ["assessments", i, "details", ...issue.path.map(String)],
            message: issue.message,
          });
    }),
  );
export type FitInput = z.infer<typeof fitInputSchema>;

const alreadyTailored = (job: { company: string; title: string }) =>
  new ApiError(`This file is already tailored for ${job.company} · ${job.title}`, 409);

export async function recordFit(versionId: string, input: FitInput, now = new Date()) {
  const { target } = input;
  return db.transaction(async (tx) => {
    // The job importer's lock, taken first, serialises concurrent records for one opening.
    await tx.execute(sql`select pg_advisory_xact_lock(8093210)`);
    const [version] = await tx
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.id, versionId));
    if (!version) throw new ApiError("Unknown résumé file.", 404);
    if (version.parsingStatus !== "COMPLETED")
      throw new ApiError("This file's text has not been extracted yet.", 422);
    const [current] = version.targetJobId
      ? await tx.select().from(jobs).where(eq(jobs.id, version.targetJobId))
      : [];
    const baseId = input.baseVersionId ?? version.baseVersionId;
    if (input.baseVersionId) {
      if (input.baseVersionId === versionId)
        throw new ApiError("A file can't be tailored from itself.", 409);
      const [base] = await tx
        .select({ resumeId: resumeVersions.resumeId })
        .from(resumeVersions)
        .where(eq(resumeVersions.id, input.baseVersionId));
      if (base?.resumeId !== version.resumeId)
        throw new ApiError("The base must be another file in the same résumé.", 409);
      if (current && version.baseVersionId && version.baseVersionId !== input.baseVersionId)
        throw alreadyTailored(current);
    }
    if (input.assessments.some((a) => a.versionId !== versionId && a.versionId !== baseId))
      throw new ApiError("Assessments must be for this file or its base.", 422);

    const job = jobInputSchema.parse({
      url: target.url,
      company: target.company,
      title: target.title,
      location: target.location ?? "",
      description: target.description,
      externalId: target.reqId,
      source: "AGENT_FIT",
    });
    // Only what the agent sent is merged; defaults never overwrite an existing opening.
    const providedFields = ["url", "company", "title", "description"];
    if (target.location !== undefined) providedFields.push("location");
    if (target.reqId) providedFields.push("externalId");
    const summary = await importJobRows([{ ...job, providedFields }], "merge", tx);
    const jobId = summary.ids[0];
    if (current && current.id !== jobId) throw alreadyTailored(current);

    const [stored] = await tx.select().from(jobs).where(eq(jobs.id, jobId));
    // A repost date never replaces a recorded original posting date.
    if (
      target.postedAt &&
      (!stored.postedAt ||
        (target.postedAtKind === "original" && stored.postedAtKind !== "ORIGINAL"))
    )
      await tx
        .update(jobs)
        .set({
          postedAt: new Date(target.postedAt),
          postedAtKind: target.postedAtKind?.toUpperCase() ?? null,
          postedAtSourceUrl: target.postedAtSourceUrl ?? null,
          updatedAt: now,
        })
        .where(eq(jobs.id, jobId));
    const [snapshot] = await tx
      .select({ id: jobSnapshots.id })
      .from(jobSnapshots)
      .where(eq(jobSnapshots.jobId, jobId))
      .orderBy(desc(jobSnapshots.capturedAt))
      .limit(1);

    await tx
      .update(resumeVersions)
      .set({ baseVersionId: baseId, targetJobId: jobId, targetSnapshotId: snapshot.id })
      .where(eq(resumeVersions.id, versionId));
    const assessedAt = indiaDayBoundary(indiaDate(now))!;
    if (input.assessments.length)
      await tx.insert(resumeAssessments).values(
        input.assessments.map((a) => ({
          versionId: a.versionId,
          snapshotId: snapshot.id,
          source: a.source,
          method: a.method,
          score: a.score,
          findings: a.findings,
          details: toolDetailsSchema[a.source].parse(a.details),
          assessedAt,
        })),
      );
    await tx.insert(activityLogs).values({
      action: "RESUME_FIT_RECORDED",
      entityType: "RESUME",
      entityId: versionId,
      summary: `Recorded fit for ${version.versionLabel} against ${stored.company} — ${stored.title}`,
      metadata: {
        source: "AGENT_FIT",
        jobId,
        snapshotId: snapshot.id,
        recorded: input.assessments.length,
      },
    });
    return { versionId, jobId, snapshotId: snapshot.id, recorded: input.assessments.length };
  });
}

export type Fit = {
  versionId: string;
  baseVersionId: string | null;
  target: {
    jobId: string;
    company: string;
    title: string;
    location: string;
    url: string;
    reqId: string | null;
    postedAt: string | null;
    postedAtKind: string | null;
  } | null;
  snapshot: { id: string; capturedAt: Date; description: string } | null;
  mine: Partial<Record<ToolSource, ParsedRow>>;
  base: Partial<Record<ToolSource, ParsedRow>>;
  chips: Chip[];
  derivedFrom: { id: string; label: string }[];
};

export async function getFit(versionId: string): Promise<Fit | null> {
  const [version] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, versionId));
  if (!version) return null;
  const derivedFrom = await db
    .select({ id: resumeVersions.id, label: resumeVersions.versionLabel })
    .from(resumeVersions)
    .where(eq(resumeVersions.baseVersionId, versionId))
    .orderBy(asc(resumeVersions.createdAt));
  const fit: Fit = {
    versionId,
    baseVersionId: version.baseVersionId,
    target: null,
    snapshot: null,
    mine: {},
    base: {},
    chips: [],
    derivedFrom,
  };
  if (!version.targetJobId || !version.targetSnapshotId) return fit;
  const [[job], [snapshot]] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, version.targetJobId)),
    db.select().from(jobSnapshots).where(eq(jobSnapshots.id, version.targetSnapshotId)),
  ]);
  fit.target = {
    jobId: job.id,
    company: job.company,
    title: job.title,
    location: job.location,
    url: job.canonicalUrl,
    reqId: job.externalId,
    postedAt: job.postedAt ? indiaDate(job.postedAt) : null,
    postedAtKind: job.postedAtKind,
  };
  fit.snapshot = {
    id: snapshot.id,
    capturedAt: snapshot.capturedAt,
    description: snapshot.description,
  };
  const ids = [versionId, ...(version.baseVersionId ? [version.baseVersionId] : [])];
  const rows = (
    await db
      .select()
      .from(resumeAssessments)
      .where(
        and(
          inArray(resumeAssessments.versionId, ids),
          eq(resumeAssessments.snapshotId, snapshot.id),
        ),
      )
  )
    .map((row) => parseToolRow({ ...row, details: row.details }))
    .filter((row): row is ParsedRow => row !== null);
  fit.mine = latestBySource(rows, versionId, snapshot.id);
  if (version.baseVersionId) fit.base = latestBySource(rows, version.baseVersionId, snapshot.id);
  const lexical = fit.mine["jobops-lexical"]?.parsed as LexicalDetails | undefined;
  if (lexical)
    fit.chips = deriveChips(
      lexical,
      fit.base["jobops-lexical"]?.parsed as LexicalDetails | undefined,
      fit.mine["resume-ats-optimizer"]?.parsed as OptimizerDetails | undefined,
    );
  return fit;
}
