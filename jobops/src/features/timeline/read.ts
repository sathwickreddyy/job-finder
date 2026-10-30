import { buildLanes, pendingMailFrom } from "@/features/applications/lanes";
import { recordStateFrom, type Phase, type RecordState } from "@/features/applications/phase";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { loadMailContext } from "@/features/mail/context";
import { listMail, mailFacts } from "@/features/mail/mail-list";
import { readMailTriage } from "@/features/mail/read";
import type { MailTag } from "@/features/mail/tags";
import { queueMailFrom } from "@/features/mail/triage";
import { timelineEntries, type TimelineDay } from "./entries";
import { companyRows, type RailRow } from "./index-rows";

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

export type CompanyIndex = {
  rows: RailRow[];
  home: { open: number; total: number; matches: number | null };
};

/** The Mail rail: Applications' lanes (the same needs-you signal) joined with visible mail. */
export async function readCompanyIndex(
  filters: { tag?: MailTag; q?: string },
  now = new Date(),
): Promise<CompanyIndex> {
  const [context, { records, snoozes }] = await Promise.all([
    loadMailContext(),
    readApplications(),
  ]);
  const triage = await readMailTriage(records);
  const items = buildQueue({ records, mail: queueMailFrom(triage.messages), snoozes, now });
  const lanes = buildLanes({ records, items, pending: pendingMailFrom(triage.messages), now });
  const keys = new Map(context.applications.map((app) => [app.id, app.company]));
  const { facts, matches } = await mailFacts(context, (id) => keys.get(id), filters);
  const { rows, home } = companyRows({
    lanes,
    mail: facts,
    names: new Map(context.companies.map((company) => [company.id, company])),
    matches:
      matches && new Map([...matches].flatMap(([key, count]) => (key ? [[key, count]] : []))),
  });
  return { rows, home: { ...home, matches: matches ? (matches.get(null) ?? 0) : null } };
}
