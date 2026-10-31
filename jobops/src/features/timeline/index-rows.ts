import type { Lane, LaneGroup, LaneNext } from "@/features/applications/lanes";

export type RailGroup = "needs" | "waiting" | "closed" | "previous";
export type RailDue = { label: string; tone: "now" | "late" | "calm" };
export type RailRow = {
  key: string;
  name: string;
  slug: string | null;
  group: RailGroup;
  signal: string;
  /** The lane's next step, for the pane header; null for mail-only companies. */
  next: string | null;
  due: RailDue | null;
  newCount: number;
  matches: number | null;
  latestAt: string | null;
};
/** One company's visible mail; `key` is null for mail that matched no company. */
export type MailFacts = {
  key: string | null;
  open: number;
  total: number;
  latestAt: string;
  latestOpenKind: string | null;
};

const groupOf: Record<LaneGroup, RailGroup> = {
  needs: "needs",
  active: "waiting",
  closed: "closed",
};
const dueOf = (next: LaneNext | null): RailDue | null =>
  next
    ? {
        label: next.when,
        tone: next.due === "today" ? "now" : next.due === "overdue" ? "late" : "calm",
      }
    : null;

/**
 * One rail row per company: Applications' lanes in their own order, open mail forcing
 * Needs you, then companies that only have mail, newest first.
 */
export function companyRows(input: {
  lanes: Lane[];
  mail: MailFacts[];
  names: Map<string, { name: string; slug: string | null }>;
  matches: Map<string, number> | null;
  /** Former employers: listed under Previous employers unless their mail needs you. */
  previous?: Map<string, string>;
}): { rows: RailRow[]; home: { open: number; total: number } } {
  const byKey = new Map(input.mail.map((facts) => [facts.key, facts]));
  const laneRows: RailRow[] = input.lanes.map((lane) => {
    const facts = byKey.get(lane.key);
    const open = facts?.open ?? 0;
    return {
      key: lane.key,
      name: input.names.get(lane.key)?.name ?? lane.company,
      slug: input.names.get(lane.key)?.slug ?? null,
      group: open ? "needs" : groupOf[lane.group],
      signal: facts?.latestOpenKind ?? lane.next?.text ?? lane.status.label,
      next: lane.next?.text ?? null,
      due: dueOf(lane.next),
      newCount: open,
      matches: null,
      latestAt: facts?.latestAt ?? null,
    };
  });
  const laneKeys = new Set(input.lanes.map((lane) => lane.key));
  const mailRows: RailRow[] = input.mail
    .filter(
      (facts): facts is MailFacts & { key: string } => !!facts.key && !laneKeys.has(facts.key),
    )
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
    .map((facts) => ({
      key: facts.key,
      name: input.names.get(facts.key)?.name ?? facts.key,
      slug: input.names.get(facts.key)?.slug ?? null,
      group: facts.open ? "needs" : input.previous?.has(facts.key) ? "previous" : "closed",
      signal: facts.latestOpenKind ?? input.previous?.get(facts.key) ?? "No application recorded",
      next: null,
      due: null,
      newCount: facts.open,
      matches: null,
      latestAt: facts.latestAt,
    }));
  const rows = [...laneRows, ...mailRows];
  const home = byKey.get(null);
  return {
    rows: input.matches
      ? rows.flatMap((row) => {
          const matches = input.matches!.get(row.key) ?? 0;
          return matches ? [{ ...row, matches }] : [];
        })
      : rows,
    home: { open: home?.open ?? 0, total: home?.total ?? 0 },
  };
}
