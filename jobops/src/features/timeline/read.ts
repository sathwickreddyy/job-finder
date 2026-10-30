import { recordStateFrom, type Phase, type RecordState } from "@/features/applications/phase";
import { readApplications } from "@/features/applications/read";
import { loadMailContext } from "@/features/mail/context";
import { listMail } from "@/features/mail/mail-list";
import type { MailTag } from "@/features/mail/tags";
import { timelineEntries, type TimelineDay } from "./entries";

export type TimelineRole = {
  id: string;
  role: string;
  source: string;
  phase: Phase;
  state: RecordState;
};
export type CompanyTimelineData = {
  company: { key: string; name: string; slug: string | null; city: string };
  roles: TimelineRole[];
  days: TimelineDay[];
  nextCursor: string | null;
};

/** One company's emails (50 a page) and application steps, for Mail and the company page. */
export async function readCompanyTimeline(
  key: string,
  filters: { tag?: MailTag; q?: string; application?: string; cursor?: string },
  now = new Date(),
): Promise<CompanyTimelineData> {
  const context = await loadMailContext();
  const [{ items, nextCursor }, { records }] = await Promise.all([
    listMail({ company: key, attention: "all", ...filters }, context),
    readApplications(),
  ]);
  const own = records.filter((record) => record.companyKey === key);
  const shown = filters.application
    ? own.filter((record) => record.id === filters.application)
    : own;
  const listed = context.companies.find((company) => company.id === key);
  return {
    company: {
      key,
      name: listed?.name ?? own[0]?.companyName ?? items[0]?.company?.name ?? key,
      slug: listed?.slug ?? null,
      city: own[0]?.city ?? "",
    },
    roles: own.map((record) => {
      const state = recordStateFrom(
        record,
        record.rounds,
        record.events.map((event) => event.eventType),
      );
      return {
        id: record.id,
        role: record.role,
        source: record.source,
        phase: record.phase,
        state,
      };
    }),
    days: timelineEntries({
      mail: items,
      events: shown.flatMap((record) => record.events),
      rounds: shown.flatMap((record) => record.rounds),
      complete: nextCursor === null,
      filtered: Boolean(filters.tag || filters.q),
      now,
    }),
    nextCursor,
  };
}
