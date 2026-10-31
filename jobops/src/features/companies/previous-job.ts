import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, like, lt, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { applicationEvents, applications, companyRecords, jobs, mailMessages } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { companyResolver, normalizeCompany } from "@/features/applications/lanes";
import type { WorkspaceApplication } from "@/features/mail/context";
import type { MailClassification } from "@/features/mail/tags";

/** A job the user held before, recorded with "Add previous job". Months are `YYYY-MM`. */
export type PreviousJob = {
  applicationId: string;
  companyKey: string;
  role: string;
  joinedOn: string;
  leftOn: string | null;
};

export const PREVIOUS_JOB = "PREVIOUS_JOB";
/** Previous jobs need a canonical URL; this internal key never pretends to be a posting. */
export const previousJobUrl = (id: string) => `jobops:previous/${id}`;
/** Leaves previous jobs out of everything that treats jobs as openings. */
export const notPreviousJob = sql`${jobs.canonicalUrl} NOT LIKE 'jobops:previous/%'`;

const month = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Use a month like 2022-04.");
export const previousJobInput = z
  .object({
    company: z.string().trim().min(1, "Enter the company.").max(300),
    role: z.string().trim().min(1, "Enter the role title.").max(200),
    joinedOn: month,
    leftOn: month.optional(),
    notes: z.string().trim().max(2000).optional(),
    createCompany: z.boolean().optional(),
  })
  .refine((value) => !value.leftOn || value.leftOn >= value.joinedOn, {
    message: "The left month can't be before the joined month.",
    path: ["leftOn"],
  });

/** Midnight in India on the first of a month, `offset` months after `YYYY-MM`. */
function monthStart(value: string, offset = 0) {
  const [year, monthNumber] = value.split("-").map(Number);
  const index = year * 12 + monthNumber - 1 + offset;
  const shown = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  return new Date(`${shown}-01T00:00:00+05:30`);
}
const linkable: MailClassification[] = ["OFFER", "BACKGROUND_CHECK", "ONBOARDING"];
const closedStatuses = ["REJECTED", "WITHDRAWN", "CLOSED"] as const;

/**
 * The previous job an email belongs to: only offer, background-check and joining mail, only
 * when the company has no open application, and only when it arrived before the end of the
 * month after the joined month. Otherwise the normal "Which role?" link applies.
 */
export function previousJobFor(
  apps: WorkspaceApplication[],
  companyKey: string,
  classification: MailClassification,
  receivedAt: Date,
): string | null {
  if (!linkable.includes(classification)) return null;
  const own = apps.filter((app) => app.company === companyKey);
  if (own.some((app) => !app.previousJob && !app.closed)) return null;
  const candidates = own
    .filter((app) => app.previousJob)
    .map((app) => ({ id: app.id, cutoff: monthStart(app.previousJob!.joinedOn, 2) }))
    .filter((app) => receivedAt < app.cutoff)
    .sort((a, b) => a.cutoff.getTime() - b.cutoff.getTime());
  return candidates[0]?.id ?? null;
}

async function slugFor(name: string) {
  let base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "company";
  if (["schema", "batch"].includes(base) || z.uuid().safeParse(base).success) base += "-company";
  const taken = new Set(
    (
      await db
        .select({ slug: companyRecords.slug })
        .from(companyRecords)
        .where(like(companyRecords.slug, `${base}%`))
    ).map((row) => row.slug),
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Record a job the user held. It is a closed, accepted application with source PREVIOUS_JOB
 * and no applied or posted date, plus a JOINED event. Existing offer, background-check and
 * joining mail from around the joined month is linked at once and marked handled.
 */
export async function addPreviousJob(
  input: z.input<typeof previousJobInput>,
): Promise<{ applicationId: string; linked: number; companyKey: string }> {
  const parsed = previousJobInput.safeParse(input);
  if (!parsed.success) throw new ApiError(parsed.error.issues[0].message, 400);
  const { company, role, joinedOn, leftOn, notes, createCompany } = parsed.data;
  const records = await db.select().from(companyRecords);
  const wanted = normalizeCompany(company);
  let record = records.find((row) =>
    [row.name, ...row.aliases].some((name) => normalizeCompany(name) === wanted),
  );
  if (!record && !createCompany)
    throw new ApiError("Company not found. Add it as a previous employer from Companies.", 404);
  record ??= (
    await db
      .insert(companyRecords)
      .values({ slug: await slugFor(company), name: company, kind: "PREVIOUS_EMPLOYER" })
      .returning()
  )[0];
  const companyKey = normalizeCompany(record.name);
  const resolve = companyResolver(
    records.some((row) => row.id === record.id) ? records : [...records, record],
  );

  return db.transaction(async (tx) => {
    const id = randomUUID();
    const [job] = await tx
      .insert(jobs)
      .values({
        company: record.name,
        title: role,
        canonicalUrl: previousJobUrl(id),
        dedupeKey: `previous:${id}`,
        source: PREVIOUS_JOB,
        status: "CLOSED",
      })
      .returning();
    const [app] = await tx
      .insert(applications)
      .values({
        jobId: job.id,
        status: "CLOSED",
        closedReason: "ACCEPTED",
        source: PREVIOUS_JOB,
        notes: notes ?? "",
      })
      .returning();
    await tx.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: "JOINED",
      summary: `Joined ${record.name} as ${role}`,
      payload: { joinedOn, leftOn: leftOn ?? null },
      occurredAt: monthStart(joinedOn),
    });
    const open = (
      await tx
        .select({ company: jobs.company })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(notInArray(applications.status, [...closedStatuses]), notPreviousJob))
    ).some((row) => resolve(row.company).companyKey === companyKey);
    if (open) return { applicationId: app.id, linked: 0, companyKey };
    const linked = await tx
      .update(mailMessages)
      .set({ linkedApplicationId: app.id, attentionState: "DONE", processedAt: new Date() })
      .where(
        and(
          eq(mailMessages.companyKey, companyKey),
          isNull(mailMessages.linkedApplicationId),
          inArray(mailMessages.classification, linkable),
          lt(mailMessages.receivedAt, monthStart(joinedOn, 2)),
          sql`NOT EXISTS (SELECT 1 FROM mail_tracking t WHERE t.message_id = "mail_messages"."id" AND t.disposition = 'excluded')`,
        ),
      )
      .returning({ id: mailMessages.id });
    return { applicationId: app.id, linked: linked.length, companyKey };
  });
}

/** Every previous job, most recently joined first. */
export async function previousJobs(): Promise<PreviousJob[]> {
  const [rows, records] = await Promise.all([
    db
      .select({
        applicationId: applications.id,
        company: jobs.company,
        role: jobs.title,
        payload: applicationEvents.payload,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(
        applicationEvents,
        and(
          eq(applicationEvents.applicationId, applications.id),
          eq(applicationEvents.eventType, "JOINED"),
        ),
      )
      .where(eq(applications.source, PREVIOUS_JOB)),
    db.select({ name: companyRecords.name, aliases: companyRecords.aliases }).from(companyRecords),
  ]);
  const resolve = companyResolver(records);
  return rows
    .map((row) => ({
      applicationId: row.applicationId,
      companyKey: resolve(row.company).companyKey,
      role: row.role,
      joinedOn: typeof row.payload?.joinedOn === "string" ? row.payload.joinedOn : "",
      leftOn: typeof row.payload?.leftOn === "string" ? row.payload.leftOn : null,
    }))
    .sort((a, b) => b.joinedOn.localeCompare(a.joinedOn));
}
