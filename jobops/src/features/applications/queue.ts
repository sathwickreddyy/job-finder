import { roundKindLabel } from "@/features/companies/metrics";
import type { RoundKind } from "@/lib/round-kinds";
import { addDays, formatDayTime, istDayStart, istDaysBetween } from "./dates";
import {
  inboundEvents,
  isOutreach,
  methodLabel,
  phaseOf,
  recordStateFrom,
  type RoundOutcome,
  type Stage,
} from "./phase";

export const SILENCE_DAYS = { DIRECT: 7, OUTREACH: 5 } as const;
export const HORIZON_DAYS = 7;
export const SNOOZE_DAYS = 2;

export type QueueRound = {
  id: string;
  kind: RoundKind;
  name: string;
  scheduledAt: Date | null;
  outcome: RoundOutcome;
};
export type QueueRecord = {
  id: string;
  company: string;
  role: string;
  source: string;
  status: Stage;
  contact: string | null;
  sentAt: Date | null;
  nextActionAt: Date | null;
  nextActionNote: string;
  rounds: QueueRound[];
  events: { eventType: string; occurredAt: Date }[];
  linkedMail: { classification: string; receivedAt: Date }[];
};
export type QueueLink = { label: string; href: string };
export type QueueMail = {
  id: string;
  title: string;
  detail: string;
  receivedAt: Date;
  primary: QueueLink;
};
export type Due = "overdue" | "today" | "week";
export type Reason = "followup" | "silence" | "round" | "deadline" | "mail";
export type QueueItem = {
  key: string;
  recordId: string | null;
  company: string | null;
  due: Due;
  dueAt: Date;
  reason: Reason;
  title: string;
  detail: string;
  primary: QueueLink;
  secondary?: QueueLink;
};

const validDate = (value: Date) => Number.isFinite(value.getTime());
const latest = (dates: Date[]) =>
  dates
    .filter(validDate)
    .reduce<Date | null>((max, value) => (!max || value > max ? value : max), null);

const recordPhase = (record: QueueRecord) =>
  phaseOf(recordStateFrom({ ...record, appliedAt: record.sentAt }, record.rounds, []));

/** Spec §5.1: quiet days since sending, the last follow-up or the last real reply. */
export function silenceClock(record: QueueRecord, now: Date) {
  const phase = recordPhase(record);
  if (phase !== "Applied" && phase !== "Interviewing") return null;
  if (record.sentAt && (!validDate(record.sentAt) || record.sentAt > now)) return null;
  if (record.rounds.some((round) => round.outcome === "SCHEDULED")) return null;
  const nudge = latest(
    record.events
      .filter((event) => event.eventType === "FOLLOW_UP_SENT")
      .map((event) => event.occurredAt),
  );
  const inbound = latest([
    ...record.events
      .filter((event) => inboundEvents.has(event.eventType))
      .map((event) => event.occurredAt),
    ...record.linkedMail
      .filter((mail) => mail.classification !== "APPLICATION_ACKNOWLEDGEMENT")
      .map((mail) => mail.receivedAt),
  ]);
  const outreach = isOutreach(record.source);
  if (outreach && inbound && (!nudge || inbound >= nudge)) return null;
  // An unknown historical sent date stays unknown; a real dated signal can
  // still start/restart the clock for an already active legacy record.
  const since = latest([
    ...(record.sentAt ? [record.sentAt] : []),
    ...(nudge ? [nudge] : []),
    ...(inbound ? [inbound] : []),
  ]);
  if (!since || since > now) return null;
  return {
    since,
    days: istDaysBetween(since, now),
    threshold: outreach ? SILENCE_DAYS.OUTREACH : SILENCE_DAYS.DIRECT,
  };
}

export function buildQueue(input: {
  records: QueueRecord[];
  mail: QueueMail[];
  snoozes: Map<string, Date>;
  now: Date;
}): QueueItem[] {
  const { now } = input;
  const today = istDayStart(now);
  const tomorrow = addDays(today, 1);
  const horizon = addDays(today, HORIZON_DAYS + 1);
  const dueOf = (at: Date): Due | null =>
    at < today ? "overdue" : at < tomorrow ? "today" : at < horizon ? "week" : null;
  const items: QueueItem[] = [];
  const push = (item: Omit<QueueItem, "due">) => {
    if (!validDate(item.dueAt)) return;
    const due = dueOf(item.dueAt);
    if (due) items.push({ ...item, due });
  };
  for (const record of input.records) {
    const href = `/applications/${record.id}`;
    const base = { recordId: record.id, company: record.company };
    const phase = recordPhase(record);
    // Closing the parent settles every queue obligation, including stale bookings.
    if (phase === "Closed") continue;
    if (record.nextActionAt)
      push({
        ...base,
        key: `followup:${record.id}`,
        dueAt: record.nextActionAt,
        reason: "followup",
        title: record.nextActionNote || `Follow up with ${record.company}`,
        detail: `${record.role} · the date you set`,
        primary: { label: "Open record", href },
      });
    const clock = silenceClock(record, now);
    if (clock && clock.days >= clock.threshold) {
      const outreach = isOutreach(record.source);
      push({
        ...base,
        key: `silence:${record.id}`,
        dueAt: addDays(istDayStart(clock.since), clock.threshold),
        reason: "silence",
        title: outreach
          ? `No reply from ${record.contact || record.company}`
          : `${record.company} has been quiet`,
        detail: `${outreach ? `${record.company} ${methodLabel[record.source]?.toLowerCase() ?? "outreach"}` : record.role} · ${clock.days} days quiet, follow up after ${clock.threshold}`,
        primary: { label: "Record follow-up", href: `${href}?outcome=followup#what-happened` },
        secondary: { label: "Close as no reply", href: `${href}?outcome=ghosted#what-happened` },
      });
    }
    for (const round of record.rounds) {
      if (round.outcome !== "SCHEDULED" || !round.scheduledAt || !validDate(round.scheduledAt))
        continue;
      const label = roundKindLabel[round.kind];
      const oa = round.kind === "ONLINE_ASSESSMENT";
      const past = round.scheduledAt <= now;
      push({
        ...base,
        key: `round:${round.id}`,
        dueAt: round.scheduledAt,
        reason: oa ? "deadline" : "round",
        title: past
          ? `Record the ${record.company} ${label} result`
          : oa
            ? `${record.company} OA closes`
            : `${record.company} ${label} round`,
        detail: `${round.name || label} · ${formatDayTime(round.scheduledAt)}`,
        primary: past
          ? { label: "Record result", href: `${href}#what-happened` }
          : { label: "Open record", href },
      });
    }
  }
  for (const message of input.mail) {
    if (!validDate(message.receivedAt)) continue;
    items.push({
      key: `mail:${message.id}`,
      recordId: null,
      company: null,
      due: istDaysBetween(message.receivedAt, now) <= 1 ? "today" : "overdue",
      dueAt: message.receivedAt,
      reason: "mail",
      title: message.title,
      detail: message.detail,
      primary: message.primary,
    });
  }
  const order: Record<Due, number> = { overdue: 0, today: 1, week: 2 };
  return items
    .filter((item) => (input.snoozes.get(item.key)?.getTime() ?? 0) <= now.getTime())
    .sort(
      (a, b) =>
        order[a.due] - order[b.due] ||
        Number(b.reason === "mail") - Number(a.reason === "mail") ||
        a.dueAt.getTime() - b.dueAt.getTime(),
    );
}
