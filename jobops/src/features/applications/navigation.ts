import { phaseOf, recordStateFrom } from "./phase";
import { silenceClock, type QueueRecord } from "./queue";

export const tabs = ["next", "records", "emails"] as const;
export type Tab = (typeof tabs)[number];
export const recordFilters = ["active", "interviewing", "waiting", "closed", "all"] as const;
export type RecordFilter = (typeof recordFilters)[number];
export const filterLabel: Record<RecordFilter, string> = {
  active: "Active",
  interviewing: "Interviewing",
  waiting: "Waiting on them",
  closed: "Closed",
  all: "All",
};
export const queueKeyPattern =
  /^(followup|silence|round|mail):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pick = <T extends string>(options: readonly T[], value: string | undefined, fallback: T) =>
  options.find((option) => option === value) ?? fallback;

export function resolveView(params: { tab?: string; filter?: string; view?: string; q?: string }) {
  // Home links and bookmarks from the old page used ?view=applied|interviews|offers.
  const legacy: RecordFilter | null =
    params.view === "applied"
      ? "active"
      : params.view === "interviews" || params.view === "offers"
        ? "interviewing"
        : null;
  return {
    tab: legacy ? ("records" as Tab) : pick(tabs, params.tab, "next"),
    filter: legacy ?? pick(recordFilters, params.filter, "active"),
    q: (params.q ?? "").trim().slice(0, 200),
  };
}

export function matchesFilter(record: QueueRecord, filter: RecordFilter, q: string, now: Date) {
  const text = `${record.company} ${record.role} ${record.contact ?? ""}`.toLowerCase();
  if (q && !text.includes(q.toLowerCase())) return false;
  const phase = phaseOf(
    recordStateFrom(
      { ...record, appliedAt: record.sentAt },
      record.rounds,
      record.events.map((event) => event.eventType),
    ),
  );
  switch (filter) {
    case "all":
      return true;
    case "closed":
      return phase === "Closed";
    case "interviewing":
      return phase === "Interviewing" || phase === "Decision";
    case "waiting":
      return phase === "Applied" && silenceClock(record, now) !== null;
    case "active":
      return phase !== "Closed";
  }
}
