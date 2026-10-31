import { and, eq, inArray, or } from "drizzle-orm";
import { mailEvents, mailMessages, mailTracking } from "@/db/schema";
import { classifyMail } from "@/services/mail/classifier";
import type { MailConnection, ProviderId, ScannedMessage } from "@/services/mail/providers/types";
import type { MailContext } from "./context";
import type { MailTx } from "./handling-service";
import { previousJobFor } from "@/features/companies/previous-job";
import { autoApplyMail } from "./auto-apply";
import { importMailRecords, mailImportSchema } from "./import";
import { matchMail, type Match } from "./matching";
import { sortRejection } from "./rejection-sort";
import { tagOf, type MailTag } from "./tags";

export type IngestCounts = {
  fetched: number;
  alreadyHere: number;
  kept: number;
  dropped: number;
  newAttention: number;
};
export type IngestItem = {
  trackingId: string;
  messageId: string | null;
  receivedAt: string;
  sender: string;
  senderName: string;
  subject: string;
  folders: string[];
  kept: boolean;
  tag: MailTag | null;
  reason: string;
  companyKeys: string[];
  /** Why the sorter decided as it did, such as "Company sender domain". */
  evidence: string[];
};
export const noCounts = (): IngestCounts => ({
  fetched: 0,
  alreadyHere: 0,
  kept: 0,
  dropped: 0,
  newAttention: 0,
});
type Row = typeof mailTracking.$inferSelect;

/**
 * Store one provider page for Fetch new mail and company search alike. A kept identity is
 * never re-imported or reopened; a dropped one is decided again, because rules change.
 * Mail received before `recoveredBefore` arrives already handled.
 */
export async function ingestPage(
  tx: MailTx,
  input: {
    connection: MailConnection;
    providerId: ProviderId;
    messages: ScannedMessage[];
    context: MailContext;
    threads: { threadId: string | null; applicationIds: string[] }[];
    recoveredBefore: Date | null;
    /** The company a search is for: settles an ambiguous match in its favour. */
    preferCompany?: string;
  },
): Promise<{ counts: IngestCounts; items: IngestItem[] }> {
  const { connection, providerId, context } = input;
  const counts = noCounts();
  const items: IngestItem[] = [];
  const ids = input.messages.map((message) => message.externalId);
  const internetIds = input.messages.flatMap((message) =>
    message.internetMessageId ? [message.internetMessageId] : [],
  );
  const prior: Row[] = ids.length
    ? await tx
        .select()
        .from(mailTracking)
        .where(
          and(
            eq(mailTracking.provider, connection.provider),
            eq(mailTracking.accountEmail, connection.email),
            or(
              inArray(mailTracking.providerMessageId, [...ids, ...ids.map((id) => `legacy:${id}`)]),
              ...(internetIds.length ? [inArray(mailTracking.internetMessageId, internetIds)] : []),
            ),
          ),
        )
    : [];
  const decide = (raw: ScannedMessage): Match => {
    const options = {
      historical: false,
      seen: false,
      threadApplications: raw.threadId
        ? input.threads
            .filter((row) => row.threadId === raw.threadId)
            .flatMap((row) => row.applicationIds)
        : [],
    };
    const decision = matchMail(raw, context, options);
    const company = input.preferCompany;
    if (!company) return decision;
    if (decision.reason.startsWith("Ambiguous company match")) {
      const preferred = context.companies.filter((row) => row.id === company);
      return matchMail(raw, { ...context, companies: preferred }, options);
    }
    // The company's own search found it, so its dropped list keeps it even without evidence.
    if (decision.disposition === "excluded" && !decision.companyKeys.length)
      return { ...decision, companyKeys: [company] };
    return decision;
  };

  for (const raw of input.messages) {
    if (raw.contextOnly) continue;
    counts.fetched++;
    const previous =
      prior.find((row) => row.providerMessageId === raw.externalId) ??
      prior.find(
        (row) =>
          row.providerMessageId.startsWith("legacy:") &&
          (row.providerMessageId === `legacy:${raw.externalId}` ||
            (raw.internetMessageId && row.internetMessageId === raw.internetMessageId)),
      );
    // A kept identity only records where it lives now.
    if (previous?.disposition === "kept") {
      await tx
        .update(mailTracking)
        .set({ folders: raw.folders, updatedAt: new Date() })
        .where(eq(mailTracking.id, previous.id));
      if (previous.messageId)
        await tx
          .update(mailMessages)
          .set({ folders: raw.folders })
          .where(eq(mailMessages.id, previous.messageId));
      counts.alreadyHere++;
      continue;
    }
    const decision = decide(raw);
    const externalId = `${connection.email}:${raw.externalId}`;
    // Providers can return mail the importer cannot store (no sender, an over-long
    // name). Record such an identity as excluded instead of failing the whole page.
    const record = mailImportSchema.safeParse([
      {
        ...raw,
        externalId,
        subject: raw.subject.trim() || "(No subject)",
        senderName: (raw.senderName ?? "").slice(0, 500),
      },
    ]);
    const kept = decision.disposition !== "excluded" && record.success;
    const reason = record.success ? decision.reason : "Unreadable message; open it in your mailbox";
    // A dropped identity seen again keeps its row; only a new decision to keep it changes much.
    if (previous && !kept) {
      await tx
        .update(mailTracking)
        .set({
          folders: raw.folders,
          reason,
          companyKeys: decision.companyKeys,
          evidence: decision.evidence,
          updatedAt: new Date(),
        })
        .where(eq(mailTracking.id, previous.id));
      counts.alreadyHere++;
      continue;
    }
    const recovered =
      input.recoveredBefore !== null &&
      Date.parse(raw.receivedAt) < input.recoveredBefore.getTime();
    let messageId: string | null = null;
    let tag: MailTag | null = null;
    /** Stored for the first time here, so the mail rule reads it once the ledger row exists. */
    let fresh: { handled: boolean } | null = null;
    if (kept) {
      const imported = await importMailRecords(record.data!, providerId, connection.email, tx);
      const [message] = await tx
        .select({ id: mailMessages.id, classification: mailMessages.classification })
        .from(mailMessages)
        .where(and(eq(mailMessages.provider, providerId), eq(mailMessages.externalId, externalId)));
      messageId = message.id;
      tag = tagOf(message.classification);
      if (imported.imported) {
        const contactReply =
          decision.evidence.includes("Reply from a person you contacted") &&
          classifyMail(raw).type === "UNKNOWN";
        if (contactReply) tag = tagOf("FOLLOW_UP");
        // Offer, background-check and joining mail from a previous job is history, not a task.
        const previousJob =
          decision.companyKeys.length === 1
            ? previousJobFor(
                context.applications,
                decision.companyKeys[0],
                message.classification,
                new Date(raw.receivedAt),
              )
            : null;
        const handled = recovered || previousJob !== null;
        if (!handled) counts.newAttention++;
        await tx
          .update(mailMessages)
          .set({
            folders: raw.folders,
            ...(handled
              ? { attentionState: "DONE" as const, processedAt: new Date() }
              : { attentionState: "OPEN" as const }),
            ...(previousJob ? { linkedApplicationId: previousJob } : {}),
            ...(decision.companyKeys.length === 1 ? { companyKey: decision.companyKeys[0] } : {}),
            ...(contactReply ? { classification: "FOLLOW_UP" as const } : {}),
          })
          .where(eq(mailMessages.id, messageId));
        const events = await tx
          .select()
          .from(mailEvents)
          .where(eq(mailEvents.mailMessageId, messageId));
        for (const event of events) {
          const details = { ...event.details };
          delete details.suggestedApplicationId;
          await tx
            .update(mailEvents)
            .set({
              ...(contactReply ? { type: "FOLLOW_UP" as const, confidence: 0.75 } : {}),
              details: {
                ...details,
                ...(decision.applicationIds.length === 1
                  ? { suggestedApplicationId: decision.applicationIds[0] }
                  : {}),
                matchEvidence: decision.evidence,
              },
            })
            .where(eq(mailEvents.id, event.id));
        }
        if (await sortRejection(tx, messageId, context)) tag = "interviewRejected";
        fresh = { handled };
      }
    }
    const values = {
      messageId,
      folders: raw.folders,
      companyKeys: decision.companyKeys,
      applicationIds: decision.applicationIds,
      disposition: kept ? "kept" : "excluded",
      reason,
      evidence: decision.evidence,
      recovered,
    };
    let saved: Row | undefined;
    if (previous) {
      [saved] = await tx
        .update(mailTracking)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(mailTracking.id, previous.id))
        .returning();
    } else {
      [saved] = await tx
        .insert(mailTracking)
        .values({
          ...values,
          provider: connection.provider,
          accountEmail: connection.email,
          providerMessageId: raw.externalId,
          internetMessageId: raw.internetMessageId ?? null,
          threadId: raw.threadId ?? null,
          sender: raw.sender.slice(0, 1000),
          senderName: (raw.senderName ?? "").slice(0, 500),
          subject: raw.subject.slice(0, 2000),
          receivedAt: new Date(raw.receivedAt),
        })
        .onConflictDoNothing({
          target: [
            mailTracking.provider,
            mailTracking.accountEmail,
            mailTracking.providerMessageId,
          ],
        })
        .returning();
    }
    // Provider pages can repeat an identity within one page.
    if (!saved) continue;
    if (fresh && messageId) {
      // Clear outcomes update their application; asking mail stays open, even from history.
      const effect = await autoApplyMail(tx, messageId, context, new Date());
      const opened = effect.kind === "ask";
      if (fresh.handled && opened) counts.newAttention++;
      if (!fresh.handled && (effect.kind === "acknowledge" || effect.kind === "outcome"))
        counts.newAttention--;
    }
    if (!previous) prior.push(saved);
    if (kept) counts.kept++;
    else counts.dropped++;
    items.push({
      trackingId: saved.id,
      messageId,
      receivedAt: saved.receivedAt.toISOString(),
      sender: saved.sender,
      senderName: saved.senderName,
      subject: saved.subject,
      folders: saved.folders,
      kept,
      tag,
      reason,
      companyKeys: decision.companyKeys,
      evidence: decision.evidence,
    });
  }
  return { counts, items };
}
