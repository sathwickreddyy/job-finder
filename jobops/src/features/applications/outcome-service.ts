import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applicationRounds,
  applications,
  jobs,
  mailMessages,
  resumeVersions,
} from "@/db/schema";
import { roundKinds } from "@/lib/round-kinds";
import { istDateTime } from "./dates";
import { jobStateForApplication, recordIntent, recordSentAt } from "./domain";
import {
  isOutreach,
  outcomeIds,
  phaseOf,
  planOutcome,
  recordStateFrom,
  type OutcomeDetail,
  type OutcomeId,
} from "./phase";

// Like other database services, this module is called only by server actions.
// Guard accidental browser imports without adding a runtime package.
if (typeof window !== "undefined") throw new Error("Application writes run on the server.");

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockApplication(tx: Tx, id: string) {
  const [app] = await tx.select().from(applications).where(eq(applications.id, id)).for("update");
  if (!app) throw new Error("This record no longer exists.");
  return app;
}

async function recordEvidence(tx: Tx, id: string) {
  const events = await tx
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, id));
  const linkedMail = await tx
    .select({ classification: mailMessages.classification, receivedAt: mailMessages.receivedAt })
    .from(mailMessages)
    .where(eq(mailMessages.linkedApplicationId, id));
  return { events, linkedMail };
}

/** All writers take application → job/round locks; planning uses current, real evidence. */
export async function applyOutcome(
  tx: Tx,
  input: { applicationId: string; outcome: OutcomeId; detail: OutcomeDetail },
  now: Date,
) {
  const data = z
    .object({
      applicationId: z.uuid(),
      outcome: z.enum(outcomeIds),
      detail: z.object({
        kind: z.enum(roundKinds).optional(),
        at: z.date().optional(),
        name: z.string().trim().max(200),
        note: z.string().trim().max(2000),
        happenedAt: z
          .date()
          .refine((date) => date <= now, "When it happened cannot be in the future."),
      }),
    })
    .parse(input);
  const app = await lockApplication(tx, data.applicationId);
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, app.jobId)).for("update");
  if (!job) throw new Error("The linked opening no longer exists.");
  const rounds = await tx
    .select()
    .from(applicationRounds)
    .where(eq(applicationRounds.applicationId, app.id))
    .orderBy(asc(applicationRounds.position));
  const evidence = await recordEvidence(tx, app.id);
  const plan = planOutcome(
    recordStateFrom(
      { ...app, ...evidence },
      rounds,
      evidence.events.map((event) => event.eventType),
    ),
    data.outcome,
    data.detail,
  );
  const booked = rounds.find((round) => round.outcome === "SCHEDULED");
  let roundId = booked?.id ?? null;
  if (plan.round?.action === "insert") {
    const [round] = await tx
      .insert(applicationRounds)
      .values({
        applicationId: app.id,
        kind: plan.round.kind,
        name: plan.round.name,
        scheduledAt: plan.round.scheduledAt,
        position: Math.max(0, ...rounds.map((round) => round.position)) + 1,
      })
      .returning({ id: applicationRounds.id });
    roundId = round.id;
  } else if (plan.round && booked) {
    await tx
      .update(applicationRounds)
      .set(
        plan.round.action === "settle"
          ? { outcome: plan.round.outcome, updatedAt: now }
          : { scheduledAt: plan.round.scheduledAt, updatedAt: now },
      )
      .where(eq(applicationRounds.id, booked.id));
  }
  await tx
    .update(applications)
    .set({
      status: plan.status,
      closedReason: plan.closedReason,
      updatedAt: now,
    })
    .where(eq(applications.id, app.id));
  const [event] = await tx
    .insert(applicationEvents)
    .values({
      applicationId: app.id,
      eventType: plan.eventType,
      occurredAt: data.detail.happenedAt,
      summary: data.detail.note ? `${plan.summary}. ${data.detail.note}` : plan.summary,
      payload: {
        outcome: data.outcome,
        previousStatus: app.status,
        nextStatus: plan.status,
        roundId,
        detail: {
          kind: data.detail.kind ?? null,
          name: data.detail.name,
          at: data.detail.at?.toISOString() ?? null,
          happenedAt: data.detail.happenedAt.toISOString(),
          note: data.detail.note,
        },
        note: data.detail.note,
        mailMessageId: null,
      },
    })
    .returning({ id: applicationEvents.id });
  await tx
    .update(jobs)
    .set({
      status: jobStateForApplication(plan.status, job.status),
      updatedAt: now,
    })
    .where(eq(jobs.id, job.id));
  await tx.insert(activityLogs).values({
    action: "APPLICATION_OUTCOME_RECORDED",
    entityType: "APPLICATION",
    entityId: app.id,
    summary: `${job.company}: ${plan.summary}`,
  });
  return { eventId: event.id, roundId, company: job.company };
}

/** Sent records retain the exact submitted file, including legacy rows without sent dates. */
export async function updateRecordDetails(
  tx: Tx,
  data: { id: string; applicationUrl: string; resumeVersionId: string; notes: string },
  now: Date,
) {
  const previous = await lockApplication(tx, data.id);
  const evidence = await recordEvidence(tx, previous.id);
  const state = recordStateFrom({ ...previous, ...evidence }, [], []);
  const legacyDirectSent = !isOutreach(previous.source) && phaseOf(state) !== "Preparing";
  const resumeVersionId = data.resumeVersionId || null;
  if ((state.sent || legacyDirectSent) && resumeVersionId !== previous.resumeVersionId)
    throw new Error(
      "The resume used for a sent record stays fixed. Record a separate action for another file.",
    );
  if (resumeVersionId) {
    const [version] = await tx
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, resumeVersionId));
    if (!version) throw new Error("Selected resume no longer exists.");
  }
  await tx
    .update(applications)
    .set({
      applicationUrl: data.applicationUrl || null,
      resumeVersionId,
      notes: data.notes,
      updatedAt: now,
    })
    .where(eq(applications.id, previous.id));
  await tx.insert(activityLogs).values({
    action: "APPLICATION_UPDATED",
    entityType: "APPLICATION",
    entityId: previous.id,
    summary: "Updated application details",
  });
}

export async function updateRecordRound(
  tx: Tx,
  data: { id: string; name: string; day: string; time: string; notes: string },
  now: Date,
) {
  // Find only the parent first, then re-read the round after locking that parent.
  const [owner] = await tx
    .select({ applicationId: applicationRounds.applicationId })
    .from(applicationRounds)
    .where(eq(applicationRounds.id, data.id));
  if (!owner) throw new Error("This round no longer exists.");
  await lockApplication(tx, owner.applicationId);
  const [round] = await tx
    .select()
    .from(applicationRounds)
    .where(eq(applicationRounds.id, data.id))
    .for("update");
  if (!round || round.applicationId !== owner.applicationId)
    throw new Error("This round no longer exists.");
  if (data.day && !data.time && round.kind !== "ONLINE_ASSESSMENT")
    throw new Error("Choose the time of the round in India time.");
  if (!data.day && data.time) throw new Error("Choose the date of the round.");
  const scheduledAt = data.day ? istDateTime(data.day, data.time || "23:59") : null;
  if (data.day && !scheduledAt) throw new Error("Use a valid date and time in India time.");
  await tx
    .update(applicationRounds)
    .set({
      name: data.name,
      scheduledAt,
      notes: data.notes,
      updatedAt: now,
    })
    .where(eq(applicationRounds.id, round.id));
  return owner.applicationId;
}

/** Focused Preparing → sent transition, with no stage chooser or fabricated historical date. */
export async function markRecordSent(
  tx: Tx,
  data: { id: string; sentDate: string; humanConfirmed: boolean },
  now: Date,
) {
  if (!data.humanConfirmed) throw new Error("Confirm that you sent this application or outreach.");
  const sentAt = recordSentAt(data.sentDate, now);
  const app = await lockApplication(tx, data.id);
  const evidence = await recordEvidence(tx, app.id);
  const state = recordStateFrom({ ...app, ...evidence }, [], []);
  if (phaseOf(state) !== "Preparing" || state.sent)
    throw new Error("This record has already been sent or closed. Refresh the page.");
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, app.jobId)).for("update");
  if (!job) throw new Error("The linked opening no longer exists.");
  // MANUAL predates the explicit DIRECT source, and represents a direct application.
  const intent = recordIntent(isOutreach(app.source) ? app.source : "DIRECT", true);
  await tx
    .update(applications)
    .set({
      status: intent.status,
      appliedAt: intent.applied ? sentAt : null,
      updatedAt: now,
    })
    .where(eq(applications.id, app.id));
  await tx.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: intent.eventType,
    occurredAt: sentAt,
    summary: intent.applied ? "Human confirmed final submission" : "Human confirmed outreach sent",
    payload: { humanConfirmed: true, resumeVersionId: app.resumeVersionId, source: app.source },
  });
  await tx
    .update(jobs)
    .set({
      status: jobStateForApplication(intent.status, job.status),
      updatedAt: now,
    })
    .where(eq(jobs.id, job.id));
  await tx.insert(activityLogs).values({
    action: "APPLICATION_SENT",
    entityType: "APPLICATION",
    entityId: app.id,
    summary: `${job.company}: ${intent.applied ? "application" : "outreach"} recorded as sent`,
  });
}
