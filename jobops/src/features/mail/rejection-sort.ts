import { eq, inArray } from "drizzle-orm";
import { applicationRounds, mailEvents, mailMessages, type roundOutcomes } from "@/db/schema";
import type { MailContext } from "./context";
import type { MailTx } from "./handling-service";

if (typeof window !== "undefined") throw new Error("Mail writes run on the server.");

export type RoundTime = {
  scheduledAt: Date | null;
  createdAt: Date;
  outcome: (typeof roundOutcomes)[number];
};

/**
 * A rejection after at least one round that took place before it arrived is a rejection after
 * interview. Cancelled rounds never happened; a round with no time counts from when it was recorded.
 */
export function rejectionKind(
  receivedAt: Date,
  rounds: RoundTime[],
): "REJECTION" | "INTERVIEW_REJECTION" {
  const before = rounds.some(
    (round) =>
      round.outcome !== "CANCELLED" &&
      (round.scheduledAt ?? round.createdAt).getTime() < receivedAt.getTime(),
  );
  return before ? "INTERVIEW_REJECTION" : "REJECTION";
}

/** The rounds recorded on any application at a company, any role. */
export async function companyRounds(
  tx: MailTx,
  companyKey: string,
  applications: MailContext["applications"],
): Promise<RoundTime[]> {
  const ids = applications.filter((app) => app.company === companyKey).map((app) => app.id);
  if (!ids.length) return [];
  return tx
    .select({
      scheduledAt: applicationRounds.scheduledAt,
      createdAt: applicationRounds.createdAt,
      outcome: applicationRounds.outcome,
    })
    .from(applicationRounds)
    .where(inArray(applicationRounds.applicationId, ids));
}

/** Move one rejection email and its events to the kind; the caller decides it should move. */
export async function setRejectionKind(
  tx: MailTx,
  messageId: string,
  kind: "REJECTION" | "INTERVIEW_REJECTION",
) {
  await tx.update(mailMessages).set({ classification: kind }).where(eq(mailMessages.id, messageId));
  await tx.update(mailEvents).set({ type: kind }).where(eq(mailEvents.mailMessageId, messageId));
}

/**
 * Sort a newly stored rejection email once its company is set. Runs only when the email is first
 * stored, so placing it later, recording rounds later or retagging it never re-sorts it.
 */
export async function sortRejection(
  tx: MailTx,
  messageId: string,
  context: Pick<MailContext, "applications">,
): Promise<boolean> {
  const [message] = await tx
    .select({
      classification: mailMessages.classification,
      companyKey: mailMessages.companyKey,
      receivedAt: mailMessages.receivedAt,
    })
    .from(mailMessages)
    .where(eq(mailMessages.id, messageId));
  if (!message || message.classification !== "REJECTION" || !message.companyKey) return false;
  const rounds = await companyRounds(tx, message.companyKey, context.applications);
  if (rejectionKind(message.receivedAt, rounds) !== "INTERVIEW_REJECTION") return false;
  await setRejectionKind(tx, messageId, "INTERVIEW_REJECTION");
  return true;
}
