import { eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, applications, jobs, mailEvents, mailMessages } from "@/db/schema";
import {
  jobDedupeKey,
  normalizeJobUrl,
  resolveDuplicateId,
  type JobInput,
} from "@/features/jobs/import";
import { importJobRows } from "@/features/jobs/service";
import { lockMail, markMailHandled, requireOpenMail, type MailTx } from "./handling-service";
import { mailIsOpen } from "./state";
import { bucketOf } from "./triage";

if (typeof window !== "undefined") throw new Error("Mail writes run on the server.");
const roleError =
  "Only an open message in New roles for you can be saved as an opening. Refresh Emails to choose a role.";

async function requireRole(
  executor: typeof db | MailTx,
  message: typeof mailMessages.$inferSelect,
  events: (typeof mailEvents.$inferSelect)[],
) {
  const suggestions = events
    .map((event) => event.details.suggestedApplicationId)
    .filter((id): id is string => typeof id === "string" && z.uuid().safeParse(id).success);
  const [matched] = suggestions.length
    ? await executor
        .select({ id: applications.id })
        .from(applications)
        .where(inArray(applications.id, suggestions))
        .limit(1)
    : [];
  if (bucketOf({ ...message, recordId: matched?.id ?? null }) !== "roles")
    throw new Error(roleError);
}

/** Read-only prefill; saving repeats this validation under the mail lock. */
export async function readOpeningMail(mailId: string) {
  if (!z.uuid().safeParse(mailId).success)
    throw new Error("The source message link is invalid. Return to Emails and choose a message.");
  const [[message], events] = await Promise.all([
    db.select().from(mailMessages).where(eq(mailMessages.id, mailId)),
    db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, mailId)),
  ]);
  if (!message) throw new Error("This source message no longer exists.");
  if (!mailIsOpen(message, events))
    throw new Error(
      "This source message has already been handled. Return to Emails to see its current state.",
    );
  await requireRole(db, message, events);
  return message;
}

/** Existing opening locks precede mail locks, matching application → job → mail. */
export async function markMailSaved(
  mailId: string,
  jobId: string,
  transaction?: MailTx,
): Promise<boolean> {
  async function save(tx: MailTx) {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!job) throw new Error("The opening no longer exists.");
    const current = await lockMail(tx, mailId);
    if (
      current.message.attentionState === "DONE" &&
      !current.message.linkedApplicationId &&
      current.events.length &&
      current.events.every(
        (event) =>
          event.status === "REVIEWED" &&
          !event.linkedApplicationId &&
          event.details.savedOpeningId === jobId,
      )
    )
      return false;
    const { message, events } = await requireOpenMail(tx, mailId);
    await requireRole(tx, message, events);
    const sourceLink = `/mail/${mailId}`;
    const attribution = `Source email: ${sourceLink}\nFrom ${message.senderName || message.sender} <${message.sender}>\nSubject: ${message.subject}`;
    const notes = [job.notes, attribution].filter(Boolean).join("\n\n");
    if (notes.length > 20000)
      throw new Error(
        "Shorten the opening notes so the source email attribution can be saved (20,000 characters maximum).",
      );
    const now = new Date();
    await tx.update(jobs).set({ notes, updatedAt: now }).where(eq(jobs.id, jobId));
    await markMailHandled(tx, mailId, now, { savedOpeningId: jobId, sourceLink });
    await tx.insert(activityLogs).values({
      action: "MAIL_SAVED_AS_OPENING",
      entityType: "MAIL",
      entityId: mailId,
      summary: "Saved a recruiter message as an opening",
      metadata: { jobId, sourceLink },
    });
    return true;
  }
  return transaction ? save(transaction) : db.transaction(save);
}

/** The caller owns ONE outer transaction; a stale source rolls the import back. */
export async function saveMailOpening(tx: MailTx, mailId: string, data: JobInput) {
  const summary = await importJobRows([data], "skip", tx);
  // Older skip executors return no IDs. Resolve the same canonical/dedupe identity deliberately.
  const jobId =
    summary.ids[0] ??
    resolveDuplicateId(
      await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          or(
            eq(jobs.canonicalUrl, normalizeJobUrl(data.url)),
            eq(jobs.dedupeKey, jobDedupeKey(data)),
          ),
        )
        .limit(2),
    );
  if (!jobId) throw new Error("The opening could not be saved or found. Refresh and retry.");
  const handled = await markMailSaved(mailId, jobId, tx);
  return { jobId, created: summary.created > 0, handled };
}
