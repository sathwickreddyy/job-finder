import type { applicationEvents, applicationRounds } from "@/db/schema";
import { indiaDate, noonIfDateOnly } from "@/features/applications/dates";
import { roundLabels } from "@/features/applications/round-label";
import type { MailItem } from "@/features/mail/mail-item";

type EventRow = typeof applicationEvents.$inferSelect;
type RoundRow = typeof applicationRounds.$inferSelect;

export type TimelineStep = {
  type: "step";
  id: string;
  at: string;
  applicationId: string;
  eventType: string;
  text: string;
};
export type TimelineMail = { type: "mail"; at: string; item: MailItem; recorded: string | null };
export type TimelineRound = { type: "round"; at: string; round: RoundRow; label: string };
export type TimelineEntry = TimelineStep | TimelineMail | TimelineRound;
/** What the date column shows for a day; the year is only spelled out when it isn't this one. */
export type DayStamp = {
  weekday: string;
  day: number;
  month: string;
  year: number;
  thisYear: boolean;
  today: boolean;
};
export type TimelineDay = {
  key: string;
  label: string;
  stamp: DayStamp;
  entries: TimelineEntry[];
};

/** The email itself shows these, so they never appear as steps. */
const mailDriven = new Set(["MAIL_LINKED", "MAIL_UNLINKED", "ACKNOWLEDGEMENT_RECEIVED"]);
const recordedText = (event: EventRow | undefined) =>
  !event || event.eventType === "MAIL_UNLINKED"
    ? null
    : event.eventType === "MAIL_LINKED"
      ? "Added to the application"
      : event.eventType === "ACKNOWLEDGEMENT_RECEIVED"
        ? "Application acknowledged"
        : event.summary;
const DAY = 86_400_000;
// Spelled by hand so every runtime shows "Sep", never "Sept".
const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const weekdays = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

function dayStamp(key: string, now: Date): DayStamp {
  const [year, month, day] = key.split("-").map(Number);
  const today = indiaDate(now);
  return {
    weekday: weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
    day,
    month: months[month - 1],
    year,
    thisYear: year === Number(today.slice(0, 4)),
    today: key === today,
  };
}

/** "Today", "Yesterday", "Tue 27 Oct", and "Thu 21 Aug 2025" outside this year. */
function dayLabel(key: string, stamp: DayStamp, now: Date) {
  const days = Math.round((Date.parse(indiaDate(now)) - Date.parse(key)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${stamp.weekday} ${stamp.day} ${stamp.month}${stamp.thisYear ? "" : ` ${stamp.year}`}`;
}

/**
 * One company's emails, steps and rounds, newest first and grouped by India date. A round
 * sits at its scheduled time, else when it was created. Steps older than the oldest loaded email
 * wait for "Show older", and a tag or search shows emails only.
 */
export function timelineEntries(input: {
  mail: MailItem[];
  events: EventRow[];
  rounds: RoundRow[];
  complete: boolean;
  filtered: boolean;
  now: Date;
}): TimelineDay[] {
  const onPage = new Set(input.mail.map((item) => item.id));
  // The newest event about an email (by when it was written) says what was done with it.
  const latest = new Map<string, EventRow>();
  const steps: TimelineStep[] = [];
  for (const event of input.events) {
    const mailId = event.payload.mailMessageId;
    if (typeof mailId === "string" && onPage.has(mailId)) {
      const current = latest.get(mailId);
      if (!current || current.createdAt < event.createdAt) latest.set(mailId, event);
      continue;
    }
    if (mailDriven.has(event.eventType)) continue;
    steps.push({
      type: "step",
      id: event.id,
      at: noonIfDateOnly(event.occurredAt).toISOString(),
      applicationId: event.applicationId,
      eventType: event.eventType,
      text: event.summary,
    });
  }
  // Labels number technical rounds among all of an application's rounds, in position order.
  const labelOf = new Map<string, string>();
  const byApplication = Map.groupBy(input.rounds, (round) => round.applicationId);
  for (const group of byApplication.values()) {
    const ordered = [...group].sort((a, b) => a.position - b.position);
    const labels = roundLabels(ordered);
    ordered.forEach((round, index) => labelOf.set(round.id, labels[index]));
  }
  const rounds: TimelineRound[] = input.rounds
    .filter((round) => round.outcome !== "CANCELLED")
    .map((round) => ({
      type: "round",
      at: noonIfDateOnly(round.scheduledAt ?? round.createdAt).toISOString(),
      round,
      label: labelOf.get(round.id) ?? "Round",
    }));
  const oldest = input.mail.at(-1)?.receivedAt;
  const past: TimelineEntry[] = [
    ...input.mail.map((item): TimelineMail => ({
      type: "mail",
      at: item.receivedAt,
      item,
      recorded: recordedText(latest.get(item.id)),
    })),
    ...(input.filtered
      ? []
      : [...steps.filter((step) => input.complete || !oldest || step.at >= oldest), ...rounds]),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const days: TimelineDay[] = [];
  for (const entry of past) {
    const key = indiaDate(new Date(entry.at));
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else {
      const stamp = dayStamp(key, input.now);
      days.push({ key, label: dayLabel(key, stamp, input.now), stamp, entries: [entry] });
    }
  }
  return days;
}
