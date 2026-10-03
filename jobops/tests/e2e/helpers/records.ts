import { eq, inArray } from "drizzle-orm";
import { db } from "../../../src/db";
import {
  applicationEvents,
  applications,
  jobs,
  settings,
  activityLogs,
  queueSnoozes,
} from "../../../src/db/schema";

const fixtureJobIds: string[] = [];
const fixtureApplicationIds: string[] = [];

async function assertOwnedDatabase() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Record fixtures require the isolated jobops_e2e database.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Record fixtures require the browser-test ownership marker.");
}

export async function cleanupRecords() {
  await assertOwnedDatabase();
  if (!fixtureJobIds.length) return;
  if (fixtureApplicationIds.length) {
    await db.delete(queueSnoozes).where(
      inArray(
        queueSnoozes.itemKey,
        fixtureApplicationIds.flatMap((id) => [`followup:${id}`, `silence:${id}`]),
      ),
    );
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, fixtureApplicationIds));
    await db.delete(applications).where(inArray(applications.id, fixtureApplicationIds));
  }
  await db.delete(jobs).where(inArray(jobs.id, fixtureJobIds));
  fixtureJobIds.length = 0;
  fixtureApplicationIds.length = 0;
}

/** YYYY-MM-DD in India time, `offset` days from today. */
export const istDay = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

export async function seedRecord(input: {
  company: string;
  source: "DIRECT" | "REFERRAL";
  sentDaysAgo: number | null;
  contact?: string;
  title?: string;
  /** Simulates a stage set by the old dropdown. */
  status?: "APPLIED" | "TECHNICAL_INTERVIEW";
}) {
  await assertOwnedDatabase();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [job] = await db
    .insert(jobs)
    .values({
      company: input.company,
      title: input.title ?? "Backend Engineer",
      location: "Bengaluru",
      canonicalUrl: `https://example.invalid/jobs/${suffix}`,
      dedupeKey: `e2e-${suffix}`,
      source: "OTHER",
    })
    .returning();
  fixtureJobIds.push(job.id);
  const sentAt =
    input.sentDaysAgo === null ? null : new Date(Date.now() - input.sentDaysAgo * 86_400_000);
  const direct = input.source === "DIRECT";
  const [app] = await db
    .insert(applications)
    .values({
      jobId: job.id,
      source: input.source,
      status: input.status ?? (direct && sentAt ? "APPLIED" : "PREPARING"),
      appliedAt: direct ? sentAt : null,
    })
    .returning();
  fixtureApplicationIds.push(app.id);
  if (sentAt)
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: direct ? "APPLICATION_SUBMITTED" : "OUTREACH_SENT",
      occurredAt: sentAt,
      summary: direct ? "Applied on the careers site" : `Asked ${input.contact ?? "a contact"}`,
      payload: input.contact ? { recipient: input.contact } : {},
    });
  return { jobId: job.id, applicationId: app.id };
}
