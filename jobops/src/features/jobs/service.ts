import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  jobs,
  jobSnapshots,
  activityLogs,
  jobResumeMatches,
  resumeVersions,
  resumes,
} from "@/db/schema";
import { extractKeywords, compareKeywords } from "@/services/keywords";
import {
  jobDedupeKey,
  normalizeJobUrl,
  resolveDuplicateId,
  type ImportPreview,
  type JobInput,
} from "./import";

export async function findImportDuplicates(preview: ImportPreview) {
  for (const row of preview.rows) {
    if (!row.data) continue;
    const existing = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(or(eq(jobs.canonicalUrl, row.data.url), eq(jobs.dedupeKey, jobDedupeKey(row.data))))
      .limit(2);
    try {
      row.existingId = resolveDuplicateId(existing);
    } catch (error) {
      row.errors.push((error as Error).message);
      preview.valid = false;
    }
  }
  return preview;
}
export async function importJobRows(records: JobInput[], strategy: "skip" | "merge") {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(8093210)`);
    const summary = { created: 0, merged: 0, skipped: 0, ids: [] as string[] };
    for (const data of records) {
      const canonicalUrl = normalizeJobUrl(data.url),
        dedupeKey = jobDedupeKey(data);
      const existingMatches = await tx
        .select()
        .from(jobs)
        .where(or(eq(jobs.canonicalUrl, canonicalUrl), eq(jobs.dedupeKey, dedupeKey)))
        .limit(2);
      const existingId = resolveDuplicateId(existingMatches);
      const existing = existingMatches.find((job) => job.id === existingId);
      const now = new Date();
      if (existing && strategy === "skip") {
        summary.skipped++;
        summary.ids.push(existing.id);
        continue;
      }
      const skills = data.keywords ?? extractKeywords(data.description);
      const values = {
        company: data.company,
        title: data.title,
        location: data.location,
        canonicalUrl: existing?.canonicalUrl ?? canonicalUrl,
        dedupeKey,
        source: data.source,
        workMode: data.workMode,
        employmentType: data.employmentType,
        externalId: data.externalId,
        experienceMin: data.experienceMin,
        experienceMax: data.experienceMax,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        currency: data.currency,
        postedAt: data.postedAt ? new Date(data.postedAt) : undefined,
        notes: data.notes,
        lastSeenAt: now,
        updatedAt: now,
      };
      let jobId: string;
      if (existing) {
        jobId = existing.id;
        // Omitted import fields preserve existing metadata; review status always survives rediscovery.
        const keepNotes =
          data.notes && !existing.notes.split("\n\n").includes(data.notes)
            ? [existing.notes, data.notes].filter(Boolean).join("\n\n")
            : existing.notes;
        const mergedValues = {
          ...values,
          notes: keepNotes,
          workMode: data.workMode === "UNKNOWN" ? existing.workMode : data.workMode,
        };
        const provided = new Set(data.providedFields ?? Object.keys(data));
        for (const field of [
          "location",
          "source",
          "workMode",
          "employmentType",
          "externalId",
          "experienceMin",
          "experienceMax",
          "salaryMin",
          "salaryMax",
          "currency",
          "postedAt",
        ] as const) {
          if (!provided.has(field)) Reflect.deleteProperty(mergedValues, field);
        }
        mergedValues.dedupeKey = jobDedupeKey({
          company: data.company,
          title: data.title,
          location: provided.has("location") ? data.location : existing.location,
        });
        await tx.update(jobs).set(mergedValues).where(eq(jobs.id, jobId));
        summary.merged++;
      } else {
        const [created] = await tx.insert(jobs).values(values).returning({ id: jobs.id });
        jobId = created.id;
        summary.created++;
      }
      const [last] = await tx
        .select()
        .from(jobSnapshots)
        .where(eq(jobSnapshots.jobId, jobId))
        .orderBy(desc(jobSnapshots.capturedAt))
        .limit(1);
      const contentPresent = Boolean(data.description || data.keywords || data.requirements.length);
      const description = data.description || last?.description || "",
        requirements = data.requirements.length ? data.requirements : (last?.requirements ?? []),
        snapshotSkills = data.keywords ?? (data.description ? skills : (last?.skills ?? skills));
      if (
        !last ||
        (contentPresent &&
          (last.description !== description ||
            JSON.stringify(last.skills) !== JSON.stringify(snapshotSkills) ||
            JSON.stringify(last.requirements) !== JSON.stringify(requirements)))
      ) {
        await tx.insert(jobSnapshots).values({
          jobId,
          capturedAt: new Date(
            Math.max(new Date().getTime(), (last?.capturedAt.getTime() ?? 0) + 1),
          ),
          description,
          rawText: description,
          requirements,
          skills: snapshotSkills,
          metadata: { source: data.source, importUrl: canonicalUrl },
        });
        await tx.delete(jobResumeMatches).where(eq(jobResumeMatches.jobId, jobId));
      }
      await tx.insert(activityLogs).values({
        action: existing ? "JOB_MERGED" : "JOB_CREATED",
        entityType: "JOB",
        entityId: jobId,
        summary: `${existing ? "Merged" : "Added"} ${data.company} — ${data.title}`,
      });
      summary.ids.push(jobId);
    }
    return summary;
  });
}
export async function saveJobMatches(jobId: string) {
  const [snapshot] = await db
    .select()
    .from(jobSnapshots)
    .where(eq(jobSnapshots.jobId, jobId))
    .orderBy(desc(jobSnapshots.capturedAt))
    .limit(1);
  const versions = await db
    .select({ version: resumeVersions })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(and(eq(resumeVersions.isCurrent, true), eq(resumes.isActive, true)));
  await db.transaction(async (tx) => {
    for (const { version } of versions) {
      const comparison = compareKeywords(snapshot?.skills ?? [], version.keywords);
      await tx
        .insert(jobResumeMatches)
        .values({
          jobId,
          resumeVersionId: version.id,
          score: comparison.score,
          matchedKeywords: comparison.matched,
          missingKeywords: comparison.missing,
        })
        .onConflictDoUpdate({
          target: [jobResumeMatches.jobId, jobResumeMatches.resumeVersionId],
          set: {
            score: comparison.score,
            matchedKeywords: comparison.matched,
            missingKeywords: comparison.missing,
            createdAt: new Date(),
          },
        });
    }
  });
}
export async function jobTimeline(jobId: string) {
  return db
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.entityType, "JOB"), eq(activityLogs.entityId, jobId)))
    .orderBy(desc(activityLogs.createdAt))
    .limit(30);
}
