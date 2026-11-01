import { cache } from "react";
import { and, count, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { mailMessages } from "@/db/schema";
import { readApplications, type ApplicationRecord } from "@/features/applications/read";
import { ApiError } from "@/features/agent-api/http";
import { loadMailContext } from "@/features/mail/context";
import { listMail, notExcluded, readMailItem } from "@/features/mail/mail-list";
import { timelineEntries, type TimelineMail } from "@/features/timeline/entries";
import type { MailQuery } from "@/features/timeline/query";
import { markSavedOpenings, timelineRole } from "@/features/timeline/read";
import { suggestHandling } from "@/features/timeline/suggest";

export const readAttentionCount = cache(async () => {
  const [row] = await db
    .select({ value: count() })
    .from(mailMessages)
    .where(and(notExcluded, ne(mailMessages.attentionState, "DONE")));
  return row?.value ?? 0;
});

export async function readAttentionMail(
  query: Partial<MailQuery> = {},
  loaded?: ApplicationRecord[],
) {
  const [context, records] = await Promise.all([
    loadMailContext(),
    loaded ? Promise.resolve(loaded) : readApplications().then((data) => data.records),
  ]);
  const page = await listMail(
    {
      attention: "open",
      company: query.company ?? undefined,
      application: query.role ?? undefined,
      tag: query.tag ?? undefined,
      q: query.q ?? undefined,
      cursor: query.cursor ?? undefined,
    },
    context,
    query.home ? [isNull(mailMessages.companyKey), isNull(mailMessages.linkedApplicationId)] : [],
  );
  const selected = query.mail
    ? await readMailItem(query.mail, context).catch((error) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      })
    : null;
  const items =
    selected && !page.items.some((item) => item.id === selected.id)
      ? [selected, ...page.items]
      : page.items;
  const days = await markSavedOpenings(
    timelineEntries({
      mail: items,
      events: records.flatMap((record) => record.events),
      rounds: [],
      complete: true,
      filtered: false,
      now: new Date(),
    }),
  );
  const entries = days.flatMap((day) =>
    day.entries.filter((entry): entry is TimelineMail => entry.type === "mail"),
  );
  return {
    entries,
    openCount: page.openCount,
    nextCursor: page.nextCursor,
    handling: Object.fromEntries(
      items.map((item) => [
        item.id,
        suggestHandling(
          item,
          records.filter((record) => record.companyKey === item.company?.key).map(timelineRole),
        ),
      ]),
    ),
  };
}
export type AttentionMail = Awaited<ReturnType<typeof readAttentionMail>>;
