import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import {
  activityLogs,
  applicationEvents,
  applications,
  jobs,
  mailEvents,
  mailMessages,
} from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { applyOutcome } from "@/features/applications/outcome-service";
import type { MailEffect } from "./auto-apply-rule";
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
