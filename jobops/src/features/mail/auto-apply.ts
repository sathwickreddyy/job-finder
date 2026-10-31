import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import {
  activityLogs,
  applicationEvents,
  applicationRounds,
  applications,
  jobs,
  mailEvents,
  mailMessages,
  mailTracking,
} from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { applyOutcome } from "@/features/applications/outcome-service";
import { availableOutcomes, phaseOf, recordStateFrom } from "@/features/applications/phase";
import {
  decideMailEffect,
  type MailEffect,
  type RuleApplication,
  type RuleMail,
} from "./auto-apply-rule";
import type { MailContext } from "./context";
import { linkMailToRecord, lockMail, type MailTx } from "./handling-service";

if (typeof window !== "undefined") throw new Error("Mail writes run on the server.");

/** Application before job before mail, the lock order every writer uses. */
async function lockRecord(tx: MailTx, id: string) {
  const [app] = await tx.select().from(applications).where(eq(applications.id, id)).for("update");
  if (!app) throw new Error("Choose an existing record.");
  await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, app.jobId)).for("update");
  return app;
}

async function markEvents(tx: MailTx, messageId: string, patch: Record<string, unknown>) {
  const events = await tx.select().from(mailEvents).where(eq(mailEvents.mailMessageId, messageId));
  for (const event of events)
    await tx
      .update(mailEvents)
      .set({ details: { ...event.details, ...patch } })
      .where(eq(mailEvents.id, event.id));
}

/**
 * Carries out the rule's decision. Recovered history arrives handled, so the email is opened
 * first: an asking email stays open, and the existing services hand the rest back as handled.
 */
export async function applyMailEffect(
  tx: MailTx,
  messageId: string,
  effect: MailEffect,
  now: Date,
) {
  if (effect.kind === "none") return;
  if (effect.kind !== "ask") await lockRecord(tx, effect.applicationId);
  const { message } = await lockMail(tx, messageId);
  if (message.attentionState === "DONE")
    await tx
      .update(mailMessages)
      .set({ attentionState: "OPEN", processedAt: null })
      .where(eq(mailMessages.id, messageId));
  if (effect.kind === "ask") {
    if (effect.applicationId)
      await markEvents(tx, messageId, { suggestedApplicationId: effect.applicationId });
    return;
  }
  if (effect.kind === "acknowledge") {
    await linkMailToRecord(tx, messageId, effect.applicationId, now, { auto: true });
    await markEvents(tx, messageId, { autoApplied: "acknowledge" });
    return;
  }
  const happenedAt = message.receivedAt > now ? now : message.receivedAt;
  await applyOutcome(
    tx,
    {
      applicationId: effect.applicationId,
      outcome: effect.outcome,
      mailMessageId: messageId,
      auto: true,
      detail: { name: "", note: "", happenedAt },
    },
    now,
  );
  await markEvents(tx, messageId, { autoApplied: effect.outcome });
}

/** The outcome the rule recorded from this email, and whether it is still the latest one. */
export async function autoOutcomeEvent(tx: MailTx, messageId: string) {
  const [event] = await tx
    .select()
    .from(applicationEvents)
    .where(
      and(
        sql`${applicationEvents.payload}->>'mailMessageId' = ${messageId}`,
        sql`${applicationEvents.payload}->>'auto' = 'true'`,
        sql`${applicationEvents.payload} ? 'outcome'`,
      ),
    )
    .orderBy(desc(applicationEvents.createdAt))
    .limit(1);
  if (!event) return null;
  const [newer] = await tx
    .select({ id: applicationEvents.id })
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.applicationId, event.applicationId),
        ne(applicationEvents.id, event.id),
        gt(applicationEvents.createdAt, event.createdAt),
        sql`${applicationEvents.payload} ? 'outcome'`,
      ),
    )
    .limit(1);
  return { eventId: event.id, applicationId: event.applicationId, undoable: !newer };
}

/** Puts the application back as it was; the email stays linked as information. */
export async function undoAutoOutcome(tx: MailTx, messageId: string, now: Date) {
  const found = await autoOutcomeEvent(tx, messageId);
  if (!found?.undoable)
    throw new ApiError("This outcome can no longer be undone. Correct it on the application.", 409);
  const app = await lockRecord(tx, found.applicationId);
  await lockMail(tx, messageId);
  const [event] = await tx
    .delete(applicationEvents)
    .where(eq(applicationEvents.id, found.eventId))
    .returning();
  const payload = event.payload as {
    previousStatus: typeof applications.$inferSelect.status;
    previousClosedReason: typeof applications.$inferSelect.closedReason;
    previousJobStatus: typeof jobs.$inferSelect.status;
  };
  await tx
    .update(applications)
    .set({
      status: payload.previousStatus,
      closedReason: payload.previousClosedReason,
      updatedAt: now,
    })
    .where(eq(applications.id, app.id));
  await tx
    .update(jobs)
    .set({ status: payload.previousJobStatus, updatedAt: now })
    .where(eq(jobs.id, app.jobId));
  await markEvents(tx, messageId, { autoUndone: true });
  await tx.insert(activityLogs).values({
    action: "MAIL_OUTCOME_UNDONE",
    entityType: "MAIL",
    entityId: messageId,
    summary: `Undid "${event.summary}" recorded from an email`,
  });
}

const userDecisions = ["justInfo", "triageDismissal", "savedOpeningId"];

/** The email and its company's applications, read inside the caller's transaction. */
export async function ruleInputs(
  tx: MailTx,
  messageId: string,
  context: MailContext,
): Promise<{ mail: RuleMail; applications: RuleApplication[] }> {
  const [message] = await tx.select().from(mailMessages).where(eq(mailMessages.id, messageId));
  if (!message) throw new Error("This message no longer exists.");
  const [events, tracked, handEvents] = await Promise.all([
    tx.select().from(mailEvents).where(eq(mailEvents.mailMessageId, messageId)),
    tx
      .select({ applicationIds: mailTracking.applicationIds })
      .from(mailTracking)
      .where(eq(mailTracking.messageId, messageId)),
    tx
      .select({ id: applicationEvents.id })
      .from(applicationEvents)
      .where(
        and(
          sql`${applicationEvents.payload}->>'mailMessageId' = ${messageId}`,
          sql`coalesce(${applicationEvents.payload}->>'auto', '') <> 'true'`,
        ),
      )
      .limit(1),
  ]);
  const marked = events.some((event) => event.details.autoApplied || event.details.autoUndone);
  const blocked =
    marked ||
    message.linkedApplicationId !== null ||
    handEvents.length > 0 ||
    events.some((event) => userDecisions.some((key) => event.details[key]));
  const named = [
    message.linkedApplicationId,
    ...events.map((event) => event.details.suggestedApplicationId),
    ...tracked.flatMap((row) => row.applicationIds),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  const mail: RuleMail = {
    classification: message.classification,
    receivedAt: message.receivedAt,
    companyKey: message.companyKey,
    namedApplicationIds: [...new Set(named)],
    blocked,
  };
  const workspace = context.applications.filter((app) => app.company === message.companyKey);
  if (!message.companyKey || !workspace.length) return { mail, applications: [] };
  const ids = workspace.map((app) => app.id);
  const [rows, ownEvents, rounds, linkedMail] = await Promise.all([
    tx.select().from(applications).where(inArray(applications.id, ids)),
    tx.select().from(applicationEvents).where(inArray(applicationEvents.applicationId, ids)),
    tx
      .select()
      .from(applicationRounds)
      .where(inArray(applicationRounds.applicationId, ids))
      .orderBy(asc(applicationRounds.position)),
    tx
      .select({
        applicationId: mailMessages.linkedApplicationId,
        classification: mailMessages.classification,
        receivedAt: mailMessages.receivedAt,
        attentionState: mailMessages.attentionState,
      })
      .from(mailMessages)
      .where(inArray(mailMessages.linkedApplicationId, ids)),
  ]);
  const previous = new Set(workspace.filter((app) => app.previousJob).map((app) => app.id));
  return {
    mail,
    applications: rows.map((app) => {
      const own = ownEvents.filter((event) => event.applicationId === app.id);
      const ownRounds = rounds.filter((round) => round.applicationId === app.id);
      const state = recordStateFrom(
        {
          ...app,
          events: own,
          linkedMail: linkedMail.filter((row) => row.applicationId === app.id),
        },
        ownRounds,
        own.map((event) => event.eventType),
      );
      return {
        id: app.id,
        source: app.source,
        previousJob: previous.has(app.id) || app.source === "PREVIOUS_JOB",
        sentAt:
          app.appliedAt ??
          own.find((event) => event.eventType === "OUTREACH_SENT")?.occurredAt ??
          null,
        phase: phaseOf(state),
        outcomes: availableOutcomes(state),
        bookedRound: ownRounds.some((round) => round.outcome === "SCHEDULED"),
      };
    }),
  };
}

/** Decides and applies what an email does to its application, in the caller's transaction. */
export async function autoApplyMail(
  tx: MailTx,
  messageId: string,
  context: MailContext,
  now: Date,
): Promise<MailEffect> {
  const { mail, applications: apps } = await ruleInputs(tx, messageId, context);
  const effect = decideMailEffect(mail, apps);
  await applyMailEffect(tx, messageId, effect, now);
  return effect;
}

/**
 * Before a retag: undoes the rule's outcome while it can still be undone, then drops the
 * rule's link and markers so the rule reads the email afresh. Returns false, changing
 * nothing, once the user has recorded something newer (spec §1, Undo).
 */
export async function resetAutoEffect(tx: MailTx, messageId: string, now: Date) {
  const found = await autoOutcomeEvent(tx, messageId);
  if (found && !found.undoable) return false;
  if (found) await undoAutoOutcome(tx, messageId, now);
  const { message, events } = await lockMail(tx, messageId);
  if (!events.some((event) => event.details.autoApplied || event.details.autoUndone)) return true;
  if (message.linkedApplicationId) {
    await tx
      .delete(applicationEvents)
      .where(
        and(
          sql`${applicationEvents.payload}->>'mailMessageId' = ${messageId}`,
          sql`${applicationEvents.payload}->>'auto' = 'true'`,
        ),
      );
    await tx
      .update(mailMessages)
      .set({ linkedApplicationId: null })
      .where(eq(mailMessages.id, messageId));
  }
  for (const event of events) {
    const details = { ...event.details };
    delete details.autoApplied;
    delete details.autoUndone;
    await tx
      .update(mailEvents)
      .set({ details, linkedApplicationId: null })
      .where(eq(mailEvents.id, event.id));
  }
  return true;
}
