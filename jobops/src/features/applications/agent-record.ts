import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { applications, companyRecords, jobs, resumes, resumeVersions } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import {
  jobDedupeKey,
  jobInputSchema,
  normalizeJobUrl,
  resolveDuplicateId,
} from "@/features/jobs/import";
import { importJobRows } from "@/features/jobs/service";
import { companyKeyFor } from "@/features/mail/context";
import { indiaDate } from "@/features/mail/attention";
import { normalizeCompany } from "./lanes";
import { recordMethods, recordSentAt } from "./domain";
import { recordApplication } from "./record-service";

const httpUrl = z
  .url()
  .max(2000)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Use an http(s) URL.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/** The agent applies in the browser; this only records what the user confirmed was submitted. */
export const agentRecordSchema = z.strictObject({
  opening: z
    .strictObject({
      url: httpUrl,
      company: z.string().trim().min(1).max(200),
      title: z.string().trim().min(1).max(300),
      location: z.string().trim().max(300).optional(),
      description: z.string().max(100000).optional(),
      postedAt: day.optional(),
      postedAtKind: z.enum(["original", "latest_publication"]).optional(),
      postedAtSourceUrl: httpUrl.optional(),
    })
    .refine(
      (opening) => opening.postedAt || (!opening.postedAtKind && !opening.postedAtSourceUrl),
      { message: "postedAtKind and postedAtSourceUrl need postedAt.", path: ["postedAt"] },
    ),
  application: z.strictObject({
    method: z.enum(recordMethods),
    submittedAt: day.optional(),
    resumeVersionId: z.uuid().optional(),
    confirmationUrl: httpUrl.optional(),
    notes: z.string().max(20000).optional(),
    recipient: z.string().max(1000).optional(),
  }),
  humanConfirmed: z.literal(true),
});
export const applicationQuerySchema = z
  .object({
    url: z.string().trim().min(1).max(2000).optional(),
    company: z.string().trim().min(1).max(200).optional(),
  })
  .refine((query) => Boolean(query.url) !== Boolean(query.company), {
    message: "Pass exactly one of url or company.",
  });

const dayMs = 86400000;
/** Warnings never block recording; unknown posting dates stay unknown. */
export function recordWarnings(
  input: { postedAt?: string; resumeVersionId?: string },
  now: Date,
): string[] {
  const warnings: string[] = [];
  if (!input.postedAt)
    warnings.push("Posting date unknown. Verify it before applying to similar openings.");
  else {
    const age = Math.round(
      (Date.parse(`${indiaDate(now)}T00:00:00Z`) - Date.parse(`${input.postedAt}T00:00:00Z`)) /
        dayMs,
    );
    if (age > 14)
      warnings.push(`Posted ${age} days ago, more than 14 calendar days (Asia/Kolkata).`);
  }
  if (!input.resumeVersionId) warnings.push("No resume file recorded for this application.");
  return warnings;
}

async function companyLink(company: string) {
  const companies = await db
    .select({
      name: companyRecords.name,
      aliases: companyRecords.aliases,
      slug: companyRecords.slug,
    })
    .from(companyRecords)
    .where(eq(companyRecords.status, "ACTIVE"));
  const key = companyKeyFor(company, companies);
  const match = companies.find((row) => normalizeCompany(row.name) === key);
  return match ? `/companies/${match.slug}` : null;
}

export async function recordAgentApplication(
  input: unknown,
  now = new Date(),
): Promise<{
  id: string;
  duplicate: boolean;
  links: { application: string; company: string | null };
  warnings: string[];
}> {
  const { opening, application } = agentRecordSchema.parse(input);
  const sentAt = application.submittedAt ? recordSentAt(application.submittedAt, now) : now;
  const result = await db.transaction(async (tx) => {
    // The job importer's lock, taken first, serialises concurrent posts before the duplicate check.
    await tx.execute(sql`select pg_advisory_xact_lock(8093210)`);
    const job = jobInputSchema.parse({
      url: opening.url,
      company: opening.company,
      title: opening.title,
      location: opening.location ?? "",
      description: opening.description ?? "",
      source: "AGENT_RECORD",
    });
    const [found] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        or(eq(jobs.canonicalUrl, normalizeJobUrl(job.url)), eq(jobs.dedupeKey, jobDedupeKey(job))),
      )
      .limit(2);
    const existing = async (jobId: string) =>
      (
        await tx
          .select({ id: applications.id })
          .from(applications)
          .where(and(eq(applications.jobId, jobId), eq(applications.source, application.method)))
          .limit(1)
      )[0];
    const prior = found ? await existing(found.id) : undefined;
    if (prior) return { id: prior.id, duplicate: true };
    const summary = await importJobRows([job], "skip", tx);
    const jobId =
      summary.ids[0] ??
      resolveDuplicateId(
        await tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            or(
              eq(jobs.canonicalUrl, normalizeJobUrl(job.url)),
              eq(jobs.dedupeKey, jobDedupeKey(job)),
            ),
          )
          .limit(2),
      );
    if (!jobId) throw new Error("The opening could not be saved or found. Retry.");
    const [stored] = await tx.select().from(jobs).where(eq(jobs.id, jobId));
    if (
      opening.postedAt &&
      (!stored.postedAt ||
        (opening.postedAtKind === "original" && stored.postedAtKind !== "ORIGINAL"))
    )
      await tx
        .update(jobs)
        .set({
          postedAt: new Date(opening.postedAt),
          postedAtKind: opening.postedAtKind?.toUpperCase() ?? null,
          postedAtSourceUrl: opening.postedAtSourceUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
    const id = await recordApplication(tx, {
      recordId: null,
      jobId,
      versionId: application.resumeVersionId ?? null,
      method: application.method,
      state: "sent",
      notes: application.notes ?? "",
      recipient: application.recipient ?? "",
      url: application.confirmationUrl ?? "",
      sentAt,
    });
    return { id, duplicate: false };
  });
  return {
    ...result,
    links: {
      application: `/applications/${result.id}`,
      company: await companyLink(opening.company),
    },
    warnings: recordWarnings(
      { postedAt: opening.postedAt, resumeVersionId: application.resumeVersionId },
      now,
    ),
  };
}

export async function findApplications(query: { url?: string; company?: string }) {
  const parsed = applicationQuerySchema.safeParse(query);
  if (!parsed.success) throw new ApiError("Pass exactly one of url or company.", 400);
  let canonical: string | undefined;
  if (parsed.data.url)
    try {
      canonical = normalizeJobUrl(parsed.data.url);
    } catch {
      throw new ApiError("Use a valid http(s) job URL.", 400);
    }
  const rows = await db
    .select({
      id: applications.id,
      company: jobs.company,
      title: jobs.title,
      method: applications.source,
      status: applications.status,
      appliedAt: applications.appliedAt,
      url: jobs.canonicalUrl,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(canonical ? eq(jobs.canonicalUrl, canonical) : undefined)
    .orderBy(desc(applications.createdAt));
  let matches = rows;
  if (parsed.data.company) {
    const companies = await db
      .select({ name: companyRecords.name, aliases: companyRecords.aliases })
      .from(companyRecords);
    const key = companyKeyFor(parsed.data.company, companies);
    matches = rows.filter((row) => companyKeyFor(row.company, companies) === key);
  }
  return matches.map((row) => ({ ...row, appliedAt: row.appliedAt?.toISOString() ?? null }));
}

export async function listResumeFiles() {
  const rows = await db
    .select({
      id: resumeVersions.id,
      family: resumes.name,
      label: resumeVersions.versionLabel,
      isCurrent: resumeVersions.isCurrent,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .where(eq(resumes.isActive, true))
    .orderBy(desc(resumeVersions.isCurrent), desc(resumeVersions.createdAt));
  return rows;
}
