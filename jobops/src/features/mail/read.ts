import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailEvents, mailMessages } from "@/db/schema";
import { mailCanUndoDismiss, mailIsOpen } from "./state";
import { requireRecordMail } from "./source-policy";
import { bucketOf, type TriageInput } from "./triage";

export type TriageMessage = TriageInput & {
  snippet: string;
  record: { id: string; company: string; role: string } | null;
};
export type TriageData = {
  messages: TriageMessage[];
  handled: number;
  lastDismissedId: string | null;
  lastDismissalToken: string | null;
};

export async function readMailTriage(
  records: { id: string; company: string; role: string }[],
): Promise<TriageData> {
  const [messages, events] = await Promise.all([
    db.select().from(mailMessages).orderBy(desc(mailMessages.receivedAt)),
    db.select().from(mailEvents),
  ]);
  const byId = new Map(records.map((record) => [record.id, record]));
  const byMail = new Map<string, typeof events>();
  for (const event of events)
    byMail.set(event.mailMessageId, [...(byMail.get(event.mailMessageId) ?? []), event]);
  let handled = 0;
  let lastDismissed: typeof mailMessages.$inferSelect | null = null;
  const open: TriageMessage[] = [];
  for (const message of messages) {
    const own = byMail.get(message.id) ?? [];
    if (!mailIsOpen(message, own)) {
      if (
        message.attentionState === "DONE" ||
        message.linkedApplicationId ||
        own.some((event) => ["REVIEWED", "DISMISSED"].includes(event.status))
      )
        handled++;
      const batch = own[0]?.details.triageDismissal;
      if (
        typeof batch === "string" &&
        mailCanUndoDismiss(message, own, batch) &&
        message.processedAt &&
        (!lastDismissed?.processedAt || message.processedAt > lastDismissed.processedAt)
      )
        lastDismissed = message;
      continue;
    }
    const suggested = own.find((event) => typeof event.details.suggestedApplicationId === "string")
      ?.details.suggestedApplicationId;
    const record = typeof suggested === "string" ? (byId.get(suggested) ?? null) : null;
    open.push({
      ...message,
      record,
      bucket: bucketOf({ ...message, recordId: record?.id ?? null }),
    });
  }
  return {
    messages: open,
    handled,
    lastDismissedId: lastDismissed?.id ?? null,
    lastDismissalToken: lastDismissed
      ? String(byMail.get(lastDismissed.id)?.[0]?.details.triageDismissal)
      : null,
  };
}

/** Same gate as the writer; a stale URL cannot offer a handled message for linking. */
export async function readOpenMail(id: string, recordId: string) {
  const [[message], events] = await Promise.all([
    db.select().from(mailMessages).where(eq(mailMessages.id, id)),
    db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, id)),
  ]);
  if (!message)
    throw new Error("This source message no longer exists. Return to Emails to choose a message.");
  if (!mailIsOpen(message, events))
    throw new Error(
      "This source message has already been handled. Return to Emails to see its current state.",
    );
  await requireRecordMail(db, message, events, recordId, "link");
  return message;
}
