import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  jobs,
  mailEvents,
  mailMessages,
} from "@/db/schema";
import { mailCanUndoDismiss, mailIsOpen } from "./state";
import { bucketOf } from "./triage";
import { requireRecordMail } from "./source-policy";

if (typeof window !== "undefined") throw new Error("Mail writes run on the server.");
export type MailTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Call after application/job locks whenever the operation also touches those rows. */
export async function lockMail(tx: MailTx, mailId: string) {
  const [message] = await tx
    .select()
    .from(mailMessages)
    .where(eq(mailMessages.id, mailId))
    .for("update");
  if (!message) throw new Error("This message no longer exists.");
  const events = await tx
    .select()
    .from(mailEvents)
    .where(eq(mailEvents.mailMessageId, mailId))
    .orderBy(asc(mailEvents.id))
    .for("update");
  return { message, events };
}

export async function requireOpenMail(tx: MailTx, mailId: string) {
  const state = await lockMail(tx, mailId);
  if (!mailIsOpen(state.message, state.events))
    throw new Error(
      state.message.linkedApplicationId
        ? "This message is already linked. Unlink it from its record before linking elsewhere."
        : "This message has already been handled. Refresh Emails to see its current state.",
    );
  return state;
}

/** Shared with opening creation: the caller's transaction owns all related writes. */
export async function markMailHandled(
  tx: MailTx,
  mailId: string,
  now: Date,
  details: Record<string, unknown> = {},
  applicationId: string | null = null,
) {
  const { message, events } = await requireOpenMail(tx, mailId);
  await tx
    .update(mailMessages)
    .set({ linkedApplicationId: applicationId, processedAt: now, attentionState: "DONE" })
    .where(eq(mailMessages.id, mailId));
  for (const event of events)
    await tx
      .update(mailEvents)
      .set({
        status: "REVIEWED",
        linkedApplicationId: applicationId,
        details: { ...event.details, ...details },
      })
      .where(eq(mailEvents.id, event.id));
  return message;
}

export async function resolveMail(tx: MailTx, mailId: string, applicationId: string, now: Date) {
  return markMailHandled(tx, mailId, now, {}, applicationId);
}

async function lockRecord(tx: MailTx, id: string) {
  const [app] = await tx.select().from(applications).where(eq(applications.id, id)).for("update");
  if (!app) throw new Error("Choose an existing record.");
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, app.jobId)).for("update");
  if (!job) throw new Error("The opening no longer exists.");
  return app;
}

export async function linkMailToRecord(tx: MailTx, mailId: string, recordId: string, now: Date) {
  const app = await lockRecord(tx, recordId);
  const current = await lockMail(tx, mailId);
  if (
    current.message.linkedApplicationId === app.id &&
    current.events.length &&
    current.events.every(
      (event) => event.status === "REVIEWED" && event.linkedApplicationId === app.id,
    )
  )
    return false;
  const { message, events } = await requireOpenMail(tx, mailId);
  await requireRecordMail(tx, message, events, app.id, "link");
  await resolveMail(tx, mailId, app.id, now);
  const ack = message.classification === "APPLICATION_ACKNOWLEDGEMENT";
  if (ack && app.status === "APPLIED")
    await tx
      .update(applications)
      .set({ status: "ACKNOWLEDGED", updatedAt: now })
      .where(eq(applications.id, app.id));
  await tx.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: ack ? "ACKNOWLEDGEMENT_RECEIVED" : "MAIL_LINKED",
    occurredAt: message.receivedAt,
    summary: `${ack ? "Application acknowledged" : "Mail linked"}: ${message.subject}`,
    payload: { mailMessageId: mailId },
  });
  await tx.insert(activityLogs).values({
    action: "MAIL_LINKED",
    entityType: "MAIL",
    entityId: mailId,
    summary: "Linked recruiting mail to a record",
  });
  return true;
}

export async function unlinkMailFromRecord(
  tx: MailTx,
  mailId: string,
  recordId: string,
  now: Date,
) {
  await lockRecord(tx, recordId);
  const { message, events } = await lockMail(tx, mailId);
  if (!message.linkedApplicationId && mailIsOpen(message, events)) return false;
  if (
    message.linkedApplicationId !== recordId ||
    !events.length ||
    events.some((event) => event.status !== "REVIEWED" || event.linkedApplicationId !== recordId)
  )
    throw new Error("This message is no longer linked to this record. Refresh the page.");
  await tx
    .update(mailMessages)
    .set({ linkedApplicationId: null, attentionState: "OPEN", processedAt: null })
    .where(eq(mailMessages.id, mailId));
  for (const event of events)
    await tx
      .update(mailEvents)
      .set({
        linkedApplicationId: null,
        status: "NEEDS_REVIEW",
        details: { ...event.details, suggestedApplicationId: null },
      })
      .where(eq(mailEvents.id, event.id));
  await tx.insert(applicationEvents).values({
    applicationId: recordId,
    eventType: "MAIL_UNLINKED",
    occurredAt: now,
    summary: `Unlinked mail: ${message.subject}. Recorded outcomes and history were kept.`,
    payload: { mailMessageId: mailId },
  });
  await tx.insert(activityLogs).values({
    action: "MAIL_UNLINKED",
    entityType: "MAIL",
    entityId: mailId,
    summary: "Unlinked mail; kept recorded outcomes and history",
  });
  return true;
}

/** No cap: server selects the whole bucket, then rechecks each locked row. */
export async function dismissMessages(
  tx: MailTx,
  input: { ids?: string[]; noise?: boolean },
  now: Date,
) {
  const ids = input.noise
    ? (
        await tx.select({ id: mailMessages.id }).from(mailMessages).orderBy(asc(mailMessages.id))
      ).map((row) => row.id)
    : [...new Set(input.ids ?? [])].sort();
  const batch = randomUUID();
  let count = 0;
  for (const id of ids) {
    const { message, events } = await lockMail(tx, id);
    if (!mailIsOpen(message, events)) continue;
    if (input.noise && bucketOf({ ...message, recordId: null }) !== "noise") continue;
    await tx
      .update(mailMessages)
      .set({ attentionState: "DONE", processedAt: now })
      .where(eq(mailMessages.id, id));
    for (const event of events)
      await tx
        .update(mailEvents)
        .set({ status: "DISMISSED", details: { ...event.details, triageDismissal: batch } })
        .where(eq(mailEvents.id, event.id));
    await tx.insert(activityLogs).values({
      action: "MAIL_DISMISSED",
      entityType: "MAIL",
      entityId: id,
      summary: "Dismissed recruiting message",
    });
    count++;
  }
  return count;
}

/** A bulk dismissal is one undo operation. Recheck every member to avoid stale resurrection. */
export async function restoreDismissal(tx: MailTx, mailId: string, expectedDismissal: string) {
  // Read the token without locks, then lock the entire batch in the same sorted order as dismissal.
  const rows = await tx.select().from(mailEvents).where(eq(mailEvents.mailMessageId, mailId));
  const batch = rows[0]?.details.triageDismissal;
  if (typeof batch !== "string" || batch !== expectedDismissal)
    throw new Error("This dismissal can no longer be undone.");
  const candidates = await tx.select().from(mailEvents).where(eq(mailEvents.status, "DISMISSED"));
  const ids = [
    ...new Set(
      candidates
        .filter((event) => event.details.triageDismissal === batch)
        .map((event) => event.mailMessageId),
    ),
  ].sort();
  let count = 0;
  for (const id of ids) {
    const { message, events } = await lockMail(tx, id);
    if (!mailCanUndoDismiss(message, events, batch)) continue;
    await tx
      .update(mailMessages)
      .set({ attentionState: "OPEN", processedAt: null })
      .where(eq(mailMessages.id, id));
    for (const event of events) {
      const details = { ...event.details };
      delete details.triageDismissal;
      await tx
        .update(mailEvents)
        .set({ status: "NEEDS_REVIEW", details })
        .where(eq(mailEvents.id, event.id));
    }
    await tx.insert(activityLogs).values({
      action: "MAIL_DISMISS_UNDONE",
      entityType: "MAIL",
      entityId: id,
      summary: "Restored dismissed message",
    });
    count++;
  }
  return count;
}
