import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailEvents, mailMessages, mailTracking } from "@/db/schema";
import { mailIsOpen } from "./state";
import { requireRecordMail } from "./source-policy";
import { bucketOf, type TriageInput } from "./triage";

export type TriageMessage = TriageInput & {
  snippet: string;
  accountEmail: string | null;
  record: { id: string; company: string; role: string } | null;
};
export type TriageData = { messages: TriageMessage[]; handled: number };

export async function readMailTriage(
  records: { id: string; company: string; role: string }[],
): Promise<TriageData> {
  const [messages, events, tracked] = await Promise.all([
    db.select().from(mailMessages).orderBy(desc(mailMessages.receivedAt)),
    db.select().from(mailEvents),
    db
      .select({ messageId: mailTracking.messageId, disposition: mailTracking.disposition })
      .from(mailTracking),
  ]);
  const byId = new Map(records.map((record) => [record.id, record]));
  const byMail = new Map<string, typeof events>();
  for (const event of events)
    byMail.set(event.mailMessageId, [...(byMail.get(event.mailMessageId) ?? []), event]);
  // Excluded identities are never shown, even when an older import kept a copy.
  const excluded = new Set(
    tracked.flatMap((row) =>
      row.disposition === "excluded" && row.messageId ? [row.messageId] : [],
    ),
  );
  let handled = 0;
  const open: TriageMessage[] = [];
  for (const message of messages) {
    if (excluded.has(message.id)) continue;
    if (!mailIsOpen(message)) {
      handled++;
      continue;
    }
    const own = byMail.get(message.id) ?? [];
    const suggested = own.find((event) => typeof event.details.suggestedApplicationId === "string")
      ?.details.suggestedApplicationId;
    const record = typeof suggested === "string" ? (byId.get(suggested) ?? null) : null;
    open.push({
      ...message,
      record,
      bucket: bucketOf({ ...message, recordId: record?.id ?? null }),
    });
  }
  return { messages: open, handled };
}

/** Same gate as the writer; a stale URL cannot offer a handled message for linking. */
export async function readOpenMail(id: string, recordId: string) {
  const [[message], events] = await Promise.all([
    db.select().from(mailMessages).where(eq(mailMessages.id, id)),
    db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, id)),
  ]);
  if (!message)
    throw new Error("This source message no longer exists. Return to Emails to choose a message.");
  if (!mailIsOpen(message))
    throw new Error(
      "This source message has already been handled. Return to Emails to see its current state.",
    );
  await requireRecordMail(db, message, events, recordId, "link");
  return message;
}
