import { PREVIOUS_JOB } from "@/features/companies/previous-job";
import { loadMailContext } from "@/features/mail/context";
import { listMail } from "@/features/mail/mail-list";
import { timelineEntries, type TimelineDay } from "@/features/timeline/entries";
import { markSavedOpenings, timelineRole } from "@/features/timeline/read";
import { suggestHandling, type Handling } from "@/features/timeline/suggest";
import { istDaysBetween } from "./dates";
import type { ApplicationRecord } from "./read";

/**
 * One application's story (spec §5): every email linked to it, plus the company's unlinked
 * mail received on or after the day the record was saved, beside its steps and rounds. Open
 * emails get the handling bar, which asks "Which role?" when siblings are open too.
 */
export async function readApplicationStory(
  record: ApplicationRecord,
  siblings: ApplicationRecord[],
  now: Date,
): Promise<{ days: TimelineDay[]; handling: Record<string, Handling> }> {
  const context = await loadMailContext();
  const [company, own] = await Promise.all([
    listMail({ company: record.companyKey, attention: "all" }, context),
    listMail({ application: record.id, attention: "all" }, context),
  ]);
  const starts = [record.sentAt, ...record.events.map((event) => event.occurredAt)].filter(
    (date): date is Date => !!date && Number.isFinite(date.getTime()),
  );
  const since = starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : null;
  const seen = new Set<string>();
  const mail = [...own.items, ...company.items]
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      if (item.application) return item.application.id === record.id;
      return since !== null && istDaysBetween(since, new Date(item.receivedAt)) >= 0;
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id));
  const days = await markSavedOpenings(
    timelineEntries({
      mail,
      events: record.events,
      rounds: record.rounds,
      complete: true,
      filtered: false,
      now,
    }),
  );
  const roles = siblings.filter((item) => item.source !== PREVIOUS_JOB).map(timelineRole);
  const handling = Object.fromEntries(
    mail
      .filter((item) => item.attention === "open")
      .map((item) => [item.id, suggestHandling(item, roles)]),
  );
  return { days, handling };
}
