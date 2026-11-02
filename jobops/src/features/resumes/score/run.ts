import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, jobSnapshots, resumeAssessments, resumeVersions } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { indiaDate, indiaDayBoundary } from "@/features/mail/attention";
import { readBuffer } from "@/services/storage";
import { parseToolRow, type ParsedRow } from "../fit/derive";
import type { LexicalDetails, ToolSource } from "../fit/tools";
import {
  carryNotes,
  jobOpsMethod,
  toLexicalDetails,
  toOptimizerDetails,
  toResumeNextDetails,
} from "./map";
import { matchResumeToJob, stripMetadataBlock } from "./resumenext-client";
import { assessLexical, assessOptimizer } from "./scoring-client";
import { getTermList, type TermList } from "./terms";
import { ToolError, toolErrorCopy } from "./tool-error";

type Version = typeof resumeVersions.$inferSelect;
type Job = typeof jobs.$inferSelect;
type Snapshot = typeof jobSnapshots.$inferSelect;
type Outcome = { score: number | null; method: string; details: Record<string, unknown> };

export type ScoreResult = {
  mine: ParsedRow;
  base: ParsedRow | null;
  baseSkipped?: "no_text" | "no_base";
};

const semver = (method: string) => /@(\d+\.\d+\.\d+)/.exec(method)?.[1] ?? null;

async function pdfOf(version: Version) {
  try {
    return await readBuffer(version.storagePath);
  } catch {
    throw new ToolError("missing_pdf", toolErrorCopy.missingPdf);
  }
}

async function latestNotes(versionId: string, snapshotId: string) {
  const rows = await db
    .select({ details: resumeAssessments.details })
    .from(resumeAssessments)
    .where(
      and(
        eq(resumeAssessments.versionId, versionId),
        eq(resumeAssessments.snapshotId, snapshotId),
        eq(resumeAssessments.source, "jobops-lexical"),
      ),
    )
    .orderBy(desc(resumeAssessments.createdAt));
  const noted = rows
    .map((r) => r.details as Partial<LexicalDetails>)
    .find((d) => d.requirements?.some((r) => r.note));
  return carryNotes(noted as LexicalDetails | undefined);
}

/** Runs one tool for one file; every number comes from the scoring service or ResumeNext. */
async function runTool(
  tool: ToolSource,
  version: Version,
  job: Job,
  snapshot: Snapshot,
  list: TermList,
): Promise<Outcome> {
  const jd = snapshot.description;
  if (tool === "jobops-lexical") {
    const result = await assessLexical(
      await pdfOf(version),
      version.originalFilename,
      jd,
      list.terms,
    );
    const notes = await latestNotes(version.id, snapshot.id);
    const details = toLexicalDetails(result, list.terms, list.fingerprint, notes);
    return {
      score: details.weighted,
      method: jobOpsMethod(`weighted_coverage@${result.engine_version}`),
      details,
    };
  }
  if (tool === "resume-ats-optimizer") {
    const result = await assessOptimizer(
      await pdfOf(version),
      version.originalFilename,
      jd,
      list.terms,
    );
    return {
      score: result.match_score,
      method: jobOpsMethod(`ats_optimizer@${result.engine_version}`),
      details: toOptimizerDetails(result, list.fingerprint),
    };
  }
  const sent = stripMetadataBlock(jd);
  const raw = await matchResumeToJob({
    resumeText: version.extractedText,
    jobDescription: sent,
    targetRole: job.title,
    targetCompany: job.company,
  });
  const details = toResumeNextDetails(raw, list.fingerprint, sent);
  return { score: details.ats_score, method: jobOpsMethod("match_resume_to_job"), details };
}

/**
 * Scores a file against a saved description with one tool, and its base with the same terms when
 * the base has no comparable row. Never changes what the file is tailored for.
 */
export async function scoreVersion(
  versionId: string,
  snapshotId: string,
  tool: ToolSource,
  now = new Date(),
): Promise<ScoreResult> {
  const [version] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, versionId));
  if (!version) throw new ApiError("Unknown résumé file.", 404);
  if (version.parsingStatus !== "COMPLETED")
    throw new ApiError("This file's text has not been extracted yet.", 422);
  const [snapshot] = await db.select().from(jobSnapshots).where(eq(jobSnapshots.id, snapshotId));
  if (!snapshot) throw new ApiError("Unknown job description.", 404);
  const [job] = await db.select().from(jobs).where(eq(jobs.id, snapshot.jobId));
  const list = await getTermList(snapshotId);
  if (!list) throw new ApiError("Review this job's terms first.", 409);

  const mine = await runTool(tool, version, job, snapshot, list);
  const [base] = version.baseVersionId
    ? await db.select().from(resumeVersions).where(eq(resumeVersions.id, version.baseVersionId))
    : [];
  const baseSkipped: ScoreResult["baseSkipped"] = !base
    ? "no_base"
    : base.parsingStatus !== "COMPLETED" || !base.extractedText.trim()
      ? "no_text"
      : undefined;
  const assessedAt = indiaDayBoundary(indiaDate(now))!;

  return db.transaction(async (tx) => {
    let baseRow: ParsedRow | null = null;
    if (base && !baseSkipped) {
      // Serialises runs for this base, snapshot and tool so a double click scores the base once.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${base.id}:${snapshotId}:${tool}`}))`,
      );
      const existing = (
        await tx
          .select()
          .from(resumeAssessments)
          .where(
            and(
              eq(resumeAssessments.versionId, base.id),
              eq(resumeAssessments.snapshotId, snapshotId),
              eq(resumeAssessments.source, tool),
            ),
          )
          .orderBy(desc(resumeAssessments.createdAt))
      )
        .map((row) => parseToolRow(row))
        .filter((row): row is ParsedRow => row !== null)
        .find(
          (row) =>
            (row.details as { termsFingerprint?: string }).termsFingerprint === list.fingerprint &&
            semver(row.method) === semver(mine.method),
        );
      if (existing) baseRow = existing;
      else {
        const outcome = await runTool(tool, base, job, snapshot, list);
        const [inserted] = await tx
          .insert(resumeAssessments)
          .values({
            versionId: base.id,
            snapshotId,
            source: tool,
            findings: "",
            assessedAt,
            ...outcome,
          })
          .returning();
        baseRow = parseToolRow(inserted);
      }
    }
    const [inserted] = await tx
      .insert(resumeAssessments)
      .values({ versionId, snapshotId, source: tool, findings: "", assessedAt, ...mine })
      .returning();
    return {
      mine: parseToolRow(inserted)!,
      base: baseRow,
      ...(baseSkipped ? { baseSkipped } : {}),
    };
  });
}
