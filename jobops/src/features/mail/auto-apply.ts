import { and, asc, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
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
import {
  availableOutcomes,
  inboundEvents,
  phaseOf,
  recordStateFrom,
} from "@/features/applications/phase";
import {
  decideMailEffect,
  type MailEffect,
  type RuleApplication,
  type RuleMail,
} from "./auto-apply-rule";
import type { MailContext } from "./context";
import {
  linkMailToRecord,
  lockMail,
  resolveMail,
  unlinkMailFromRecord,
  type MailTx,
} from "./handling-service";
import { notExcluded } from "./mail-list";

if (typeof window !== "undefined") throw new Error("Mail writes run on the server.");

/** Application before job before mail, the lock order every writer uses. */
async function lockRecord(tx: MailTx, id: string) {
  const [app] = await tx.select().from(applications).where(eq(applications.id, id)).for("update");
  if (!app) throw new Error("Choose an existing record.");
  await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, app.jobId)).for("update");
  return app;
}

/**
 * Makes concurrent fetches, searches and Include this run the mail rule one at a time, until
 * each commits: the same email fetched into two inboxes at once is then read as one email and
 * a copy. Take it before any application lock.
 */
export async function lockMailRule(tx: MailTx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('jobops:mail-rule', 0))`);
}

/** Several applications in id order, so two writers never wait on each other in a circle. */
export async function lockRecords(tx: MailTx, ids: Iterable<string>) {
  for (const id of [...new Set(ids)].sort()) await lockRecord(tx, id);
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
  if (effect.kind === "acknowledge" || effect.kind === "outcome" || effect.kind === "info")
    await lockRecord(tx, effect.applicationId);
  const { message, events } = await lockMail(tx, messageId);
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
  if (effect.kind === "copy") {
    // Handled like Just info, so its Undo reopens it; the first copy carries the decision.
    await tx
      .update(mailMessages)
      .set({ attentionState: "DONE", processedAt: now })
      .where(eq(mailMessages.id, messageId));
    for (const event of events)
      await tx
        .update(mailEvents)
        .set({
          status: "REVIEWED",
          details: { ...event.details, justInfo: true, copyOf: effect.of },
        })
        .where(eq(mailEvents.id, event.id));
    await tx.insert(activityLogs).values({
      action: "MAIL_COPY_SETTLED",
      entityType: "MAIL",
      entityId: messageId,
      summary: "Settled a copy of an email from another inbox",
      metadata: { copyOf: effect.of },
    });
    return;
  }
  if (effect.kind === "info") {
    // The user undid this outcome before: keep the email on the application as information.
    await resolveMail(tx, messageId, effect.applicationId, now);
    await markEvents(tx, messageId, { autoUndone: true });
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

const cannotUndo = () =>
  new ApiError("This outcome can no longer be undone. Correct it on the application.", 409);

/** An acknowledgement is on the application's journey, by hand or from an email. */
async function hasAcknowledgement(tx: MailTx, applicationId: string) {
  const [event] = await tx
    .select({ id: applicationEvents.id })
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.applicationId, applicationId),
        eq(applicationEvents.eventType, "ACKNOWLEDGEMENT_RECEIVED"),
      ),
    )
    .limit(1);
  return !!event;
}

/**
 * Puts the application back as it was; the email stays linked as information. Undo by the user
 * is remembered per outcome, so no later reading of the email records that outcome again.
 */
export async function undoAutoOutcome(
  tx: MailTx,
  messageId: string,
  now: Date,
  { byUser = true }: { byUser?: boolean } = {},
) {
  const first = await autoOutcomeEvent(tx, messageId);
  if (!first) throw cannotUndo();
  const app = await lockRecord(tx, first.applicationId);
  const { events } = await lockMail(tx, messageId);
  // Checked again under the lock: an outcome recorded meanwhile is newer than this one.
  const found = await autoOutcomeEvent(tx, messageId);
  if (!found?.undoable || found.eventId !== first.eventId) throw cannotUndo();
  const [event] = await tx
    .delete(applicationEvents)
    .where(eq(applicationEvents.id, found.eventId))
    .returning();
  const payload = event.payload as {
    outcome: string;
    previousStatus: typeof applications.$inferSelect.status;
    previousClosedReason: typeof applications.$inferSelect.closedReason;
    previousJobStatus: typeof jobs.$inferSelect.status;
  };
  // An acknowledgement read after the rejection still counts once the rejection is gone.
  const acknowledged =
    payload.previousStatus === "APPLIED" && (await hasAcknowledgement(tx, app.id));
  await tx
    .update(applications)
    .set({
      status: acknowledged ? "ACKNOWLEDGED" : payload.previousStatus,
      closedReason: payload.previousClosedReason,
      updatedAt: now,
    })
    .where(eq(applications.id, app.id));
  await tx
    .update(jobs)
    .set({ status: payload.previousJobStatus, updatedAt: now })
    .where(eq(jobs.id, app.jobId));
  if (byUser) {
    const undone = events.flatMap((row) =>
      Array.isArray(row.details.undoneOutcomes) ? (row.details.undoneOutcomes as string[]) : [],
    );
    await markEvents(tx, messageId, {
      autoUndone: true,
      undoneOutcomes: [...new Set([...undone, payload.outcome])],
    });
  }
  await tx.insert(activityLogs).values({
    action: "MAIL_OUTCOME_UNDONE",
    entityType: "MAIL",
    entityId: messageId,
    summary: `Undid "${event.summary}" recorded from an email`,
  });
}

/**
 * Removes the acknowledgement the mail rule recorded from this email. Applied comes back unless
 * the application moved on or another acknowledgement remains.
 */
export async function undoAutoAcknowledgement(
  tx: MailTx,
  messageId: string,
  now: Date,
  recordId?: string,
) {
  const [found] = await tx
    .select({ id: applicationEvents.id, applicationId: applicationEvents.applicationId })
    .from(applicationEvents)
    .where(
      and(
        sql`${applicationEvents.payload}->>'mailMessageId' = ${messageId}`,
        sql`${applicationEvents.payload}->>'auto' = 'true'`,
        eq(applicationEvents.eventType, "ACKNOWLEDGEMENT_RECEIVED"),
      ),
    )
    .limit(1);
  if (!found || (recordId && found.applicationId !== recordId)) return false;
  const app = await lockRecord(tx, found.applicationId);
  await tx.delete(applicationEvents).where(eq(applicationEvents.id, found.id));
  if (app.status === "ACKNOWLEDGED" && !(await hasAcknowledgement(tx, app.id)))
    await tx
      .update(applications)
      .set({ status: "APPLIED", updatedAt: now })
      .where(eq(applications.id, app.id));
  return true;
}

const userDecisions = ["justInfo", "triageDismissal", "savedOpeningId", "copyOf"];
const closingEvents = new Set([
  "REJECTION_RECEIVED",
  "ROUND_FAILED",
  "CLOSED_NO_REPLY",
  "WITHDRAWN",
  "OFFER_ACCEPTED",
  "OFFER_DECLINED",
  "REFERRAL_DECLINED",
]);

/** The email and its company's applications, read inside the caller's transaction. */
export async function ruleInputs(
  tx: MailTx,
  messageId: string,
  context: MailContext,
): Promise<{ mail: RuleMail; applications: RuleApplication[] }> {
  const [message] = await tx.select().from(mailMessages).where(eq(mailMessages.id, messageId));
  if (!message) throw new Error("This message no longer exists.");
  // One query at a time: a transaction is a single connection.
  const events = await tx.select().from(mailEvents).where(eq(mailEvents.mailMessageId, messageId));
  const tracked = await tx
    .select({
      applicationIds: mailTracking.applicationIds,
      internetMessageId: mailTracking.internetMessageId,
    })
    .from(mailTracking)
    .where(eq(mailTracking.messageId, messageId));
  const handEvents = await tx
    .select({ id: applicationEvents.id })
    .from(applicationEvents)
    .where(
      and(
        sql`${applicationEvents.payload}->>'mailMessageId' = ${messageId}`,
        sql`coalesce(${applicationEvents.payload}->>'auto', '') <> 'true'`,
      ),
    )
    .limit(1);
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
    copyOf: await storedCopy(tx, message, tracked),
    undoneOutcomes: events.flatMap((event) =>
      Array.isArray(event.details.undoneOutcomes) ? (event.details.undoneOutcomes as string[]) : [],
    ),
  };
  const workspace = context.applications.filter((app) => app.company === message.companyKey);
  if (!message.companyKey || !workspace.length) return { mail, applications: [] };
  const ids = workspace.map((app) => app.id);
  const rows = await tx.select().from(applications).where(inArray(applications.id, ids));
  const ownEvents = await tx
    .select()
    .from(applicationEvents)
    .where(inArray(applicationEvents.applicationId, ids));
  const rounds = await tx
    .select()
    .from(applicationRounds)
    .where(inArray(applicationRounds.applicationId, ids))
    .orderBy(asc(applicationRounds.position));
  const linkedMail = await tx
    .select({
      applicationId: mailMessages.linkedApplicationId,
      classification: mailMessages.classification,
      receivedAt: mailMessages.receivedAt,
      attentionState: mailMessages.attentionState,
    })
    .from(mailMessages)
    .where(inArray(mailMessages.linkedApplicationId, ids));
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
      const phase = phaseOf(state);
      // A sent record without a sent date counts from when it was recorded or submitted, which
      // is never earlier than the real send, so older mail is still left alone.
      const sentAt = state.sent
        ? (app.appliedAt ??
          own.find((event) => event.eventType === "APPLICATION_SUBMITTED")?.occurredAt ??
          app.createdAt)
        : null;
      return {
        id: app.id,
        source: app.source,
        previousJob: previous.has(app.id) || app.source === "PREVIOUS_JOB",
        sentAt,
        phase,
        closedAt:
          phase === "Closed"
            ? latestOf(
                own
                  .filter((event) => closingEvents.has(event.eventType))
                  .map((event) => event.occurredAt),
              )
            : null,
        acknowledged: own.some((event) => event.eventType === "ACKNOWLEDGEMENT_RECEIVED"),
        outcomes: availableOutcomes(state),
        bookedRound: ownRounds.some((round) => round.outcome === "SCHEDULED"),
        lastHeardAt: latestOf([
          ...own
            .filter((event) => inboundEvents.has(event.eventType) && event.payload.auto !== true)
            .map((event) => event.occurredAt),
          ...ownRounds
            .filter((round) => round.outcome !== "CANCELLED")
            .map((round) => round.scheduledAt),
        ]),
      };
    }),
  };
}

/**
 * The same email already stored from another inbox: the same Message-ID, or the same sender and
 * subject within five minutes. That copy decides and this one follows it; a copy never follows
 * another copy, so of any set exactly one is read. `lockMailRule` makes concurrent fetches take
 * turns, so the second inbox always sees the first.
 */
async function storedCopy(
  tx: MailTx,
  message: typeof mailMessages.$inferSelect,
  tracked: { internetMessageId: string | null }[],
) {
  const internetIds = tracked.flatMap((row) =>
    row.internetMessageId ? [row.internetMessageId] : [],
  );
  const [copy] = await tx
    .select({ id: mailMessages.id })
    .from(mailMessages)
    .where(
      and(
        ne(mailMessages.id, message.id),
        sql`${mailMessages.accountEmail} IS DISTINCT FROM ${message.accountEmail}`,
        sql`NOT EXISTS (SELECT 1 FROM mail_events ce WHERE ce.mail_message_id = "mail_messages"."id" AND ce.details ? 'copyOf')`,
        notExcluded,
        or(
          ...(internetIds.length
            ? [
                sql`EXISTS (SELECT 1 FROM mail_tracking c WHERE c.message_id = "mail_messages"."id" AND c.internet_message_id IN (${sql.join(
                  internetIds.map((id) => sql`${id}`),
                  sql`, `,
                )}))`,
              ]
            : []),
          and(
            sql`lower(${mailMessages.sender}) = lower(${message.sender})`,
            eq(mailMessages.subject, message.subject),
            sql`abs(extract(epoch from ${mailMessages.receivedAt} - ${message.receivedAt}::timestamptz)) <= 300`,
          ),
        ),
      ),
    )
    .orderBy(asc(mailMessages.createdAt), asc(mailMessages.id))
    .limit(1);
  return copy?.id ?? null;
}

const latestOf = (dates: (Date | null)[]) => {
  const times = dates.flatMap((date) => (date && Number.isFinite(date.getTime()) ? [date] : []));
  return times.length ? new Date(Math.max(...times.map((date) => date.getTime()))) : null;
};

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
 * The rule on one email inside a savepoint: an email it cannot apply is logged and left as it
 * was, so it never fails Fetch new mail, Include this or a retag.
 */
export async function autoApplySafely(
  tx: MailTx,
  messageId: string,
  context: MailContext,
  now: Date,
): Promise<MailEffect> {
  try {
    return await tx.transaction((step) => autoApplyMail(step, messageId, context, now));
  } catch (error) {
    console.error(`The mail rule skipped ${messageId}`, error);
    return { kind: "none" };
  }
}

/**
 * Unlinking puts back what the rule recorded from the email first, an outcome or an
 * acknowledgement, so Undo is never lost and Applied is never left behind.
 */
export async function unlinkMailWithUndo(
  tx: MailTx,
  messageId: string,
  recordId: string,
  now: Date,
) {
  const found = await autoOutcomeEvent(tx, messageId);
  if (found?.undoable && found.applicationId === recordId)
    await undoAutoOutcome(tx, messageId, now);
  await undoAutoAcknowledgement(tx, messageId, now, recordId);
  return unlinkMailFromRecord(tx, messageId, recordId, now);
}

/**
 * Before a retag: undoes the rule's outcome while it can still be undone, and its
 * acknowledgement, then drops the rule's link and markers so the rule reads the email afresh.
 * Outcomes the user undid stay remembered. Returns null, changing nothing, once the user has
 * recorded something newer (spec §1, Undo).
 */
export async function resetAutoEffect(
  tx: MailTx,
  messageId: string,
  now: Date,
): Promise<{ undone: boolean } | null> {
  const found = await autoOutcomeEvent(tx, messageId);
  if (found && !found.undoable) return null;
  if (found) await undoAutoOutcome(tx, messageId, now, { byUser: false });
  await undoAutoAcknowledgement(tx, messageId, now);
  const undone = { undone: !!found };
  const { message, events } = await lockMail(tx, messageId);
  if (!events.some((event) => event.details.autoApplied || event.details.autoUndone)) return undone;
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
  return undone;
}
