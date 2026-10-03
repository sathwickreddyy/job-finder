import { asc, desc, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  applicationEvents,
  applicationRounds,
  applications,
  companyFacts,
  companyRecords,
  jobs,
  mailMessages,
  queueSnoozes,
  resumeVersions,
} from "@/db/schema";
import { companyMetrics } from "@/features/companies/metrics";
import type { ResearchFact } from "@/features/companies/research-data";
import { phaseOf, recordStateFrom, type CloseReason, type Phase } from "./phase";
import type { QueueRecord } from "./queue";

type EventRow = typeof applicationEvents.$inferSelect;
type RoundRow = typeof applicationRounds.$inferSelect;
type LinkedMail = { id: string; subject: string; classification: string; receivedAt: Date };

export type ApplicationRecord = Omit<QueueRecord, "events" | "rounds" | "linkedMail"> & {
  events: EventRow[];
  rounds: RoundRow[];
  linkedMail: LinkedMail[];
  jobId: string;
  city: string;
  jobUrl: string;
  applicationUrl: string | null;
  notes: string;
  appliedAt: Date | null;
  resumeVersionId: string | null;
  resume: { id: string; filename: string } | null;
  closedReason: CloseReason | null;
  phase: Phase;
  typicalRounds: number | null;
  linkedIds: string[];
  latest: { summary: string; at: Date } | null;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

/** Research median round count per company name and alias; null when no research exists. */
export function typicalRoundsByName(
  companies: { name: string; aliases: string[]; facts: ResearchFact[] }[],
) {
  const counts = new Map<string, number>();
  for (const company of companies) {
    const rounds = companyMetrics(company.facts).typicalRounds;
    if (rounds === null) continue;
    for (const name of [company.name, ...company.aliases]) counts.set(normalize(name), rounds);
  }
  return (name: string) => counts.get(normalize(name)) ?? null;
}

/** Records on the same opening point at each other (spec §1.1). */
export function linkedRecordIds(rows: { id: string; jobId: string }[]) {
  const byJob = new Map<string, string[]>();
  for (const row of rows) byJob.set(row.jobId, [...(byJob.get(row.jobId) ?? []), row.id]);
  return (row: { id: string; jobId: string }) =>
    (byJob.get(row.jobId) ?? []).filter((id) => id !== row.id);
}

export async function readApplications() {
  const [rows, rounds, events, mail, snoozes, companies, facts] = await Promise.all([
    db
      .select({
        app: applications,
        job: jobs,
        version: { id: resumeVersions.id, filename: resumeVersions.originalFilename },
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(resumeVersions, eq(resumeVersions.id, applications.resumeVersionId))
      .orderBy(desc(applications.updatedAt)),
    db.select().from(applicationRounds).orderBy(asc(applicationRounds.position)),
    db.select().from(applicationEvents).orderBy(desc(applicationEvents.occurredAt)),
    db
      .select({
        id: mailMessages.id,
        applicationId: mailMessages.linkedApplicationId,
        subject: mailMessages.subject,
        classification: mailMessages.classification,
        receivedAt: mailMessages.receivedAt,
      })
      .from(mailMessages)
      .where(isNotNull(mailMessages.linkedApplicationId)),
    db.select().from(queueSnoozes).where(gt(queueSnoozes.until, new Date())),
    db
      .select({ id: companyRecords.id, name: companyRecords.name, aliases: companyRecords.aliases })
      .from(companyRecords)
      .where(eq(companyRecords.status, "ACTIVE")),
    db.select().from(companyFacts).where(eq(companyFacts.category, "INTERVIEW")),
  ]);
  const typical = typicalRoundsByName(
    companies.map((company) => ({
      ...company,
      facts: facts.filter((fact) => fact.companyId === company.id),
    })),
  );
  const linked = linkedRecordIds(rows.map(({ app }) => ({ id: app.id, jobId: app.jobId })));
  const records: ApplicationRecord[] = rows.map(({ app, job, version }) => {
    const own = events.filter((event) => event.applicationId === app.id);
    const sent = own.find((event) => event.eventType === "OUTREACH_SENT");
    const recipient = own.find(
      (event) => typeof event.payload.recipient === "string" && event.payload.recipient,
    )?.payload.recipient;
    const sentAt = app.appliedAt ?? sent?.occurredAt ?? null;
    const ownRounds = rounds.filter((round) => round.applicationId === app.id);
    const linkedMail = mail
      .filter((message) => message.applicationId === app.id)
      .map(({ id, subject, classification, receivedAt }) => ({
        id,
        subject,
        classification,
        receivedAt,
      }));
    const state = recordStateFrom(
      { ...app, linkedMail, events: own },
      ownRounds,
      own.map((event) => event.eventType),
    );
    return {
      id: app.id,
      jobId: job.id,
      company: job.company,
      role: job.title,
      city: job.location,
      jobUrl: job.canonicalUrl,
      source: app.source,
      status: app.status,
      contact: typeof recipient === "string" ? recipient : null,
      sentAt,
      appliedAt: app.appliedAt,
      nextActionAt: app.nextActionAt,
      nextActionNote: app.nextActionNote,
      rounds: ownRounds,
      events: own,
      linkedMail,
      applicationUrl: app.applicationUrl,
      notes: app.notes,
      resumeVersionId: app.resumeVersionId,
      resume: version,
      closedReason: app.closedReason,
      phase: phaseOf(state),
      typicalRounds: typical(job.company),
      linkedIds: linked(app),
      latest: own[0] ? { summary: own[0].summary, at: own[0].occurredAt } : null,
    };
  });
  return { records, snoozes: new Map(snoozes.map((row) => [row.itemKey, row.until])) };
}
