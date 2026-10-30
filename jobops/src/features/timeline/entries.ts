import type { applicationEvents, applicationRounds } from "@/db/schema";
import { indiaDate } from "@/features/applications/dates";
import { roundKindLabel } from "@/features/companies/metrics";
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
  upcoming: boolean;
};
export type TimelineMail = { type: "mail"; at: string; item: MailItem; recorded: string | null };
export type TimelineEntry = TimelineStep | TimelineMail;
export type TimelineDay = { key: string; label: string; entries: TimelineEntry[] };

/** The email itself shows these, so they never appear as steps. */
const mailDriven = new Set(["MAIL_LINKED", "MAIL_UNLINKED", "ACKNOWLEDGEMENT_RECEIVED"]);
const DAY = 86_400_000;
const weekday = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function dayLabel(key: string, now: Date) {
  const days = Math.round((Date.parse(indiaDate(now)) - Date.parse(key)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const parts = Object.fromEntries(
    weekday.formatToParts(new Date(`${key}T12:00:00+05:30`)).map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

/**
 * One company's emails and steps, newest first and grouped by India date. Booked rounds
 * still ahead sit in "Coming up", soonest first. Steps older than the oldest loaded email
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
  const recorded = new Map<string, EventRow>();
  const steps: TimelineStep[] = [];
  for (const event of input.events) {
    if (mailDriven.has(event.eventType)) continue;
    const mailId = event.payload.mailMessageId;
    if (typeof mailId === "string" && onPage.has(mailId)) {
      const current = recorded.get(mailId);
      if (!current || current.occurredAt < event.occurredAt) recorded.set(mailId, event);
      continue;
    }
    steps.push({
      type: "step",
      id: event.id,
      at: event.occurredAt.toISOString(),
      applicationId: event.applicationId,
      eventType: event.eventType,
      text: event.summary,
      upcoming: false,
    });
  }
  const upcoming: TimelineStep[] = input.rounds
    .filter(
      (round) =>
        round.outcome === "SCHEDULED" && round.scheduledAt && round.scheduledAt > input.now,
    )
    .map((round): TimelineStep => ({
      type: "step",
      id: `round:${round.id}`,
      at: round.scheduledAt!.toISOString(),
      applicationId: round.applicationId,
      eventType: "ROUND_BOOKED",
      text:
        round.kind === "ONLINE_ASSESSMENT" ? "OA closes" : `${roundKindLabel[round.kind]} round`,
      upcoming: true,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const oldest = input.mail.at(-1)?.receivedAt;
  const past: TimelineEntry[] = [
    ...input.mail.map((item): TimelineMail => ({
      type: "mail",
      at: item.receivedAt,
      item,
      recorded: recorded.get(item.id)?.summary ?? null,
    })),
    ...(input.filtered
      ? []
      : steps.filter((step) => input.complete || !oldest || step.at >= oldest)),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const days: TimelineDay[] = [];
  if (upcoming.length && !input.filtered)
    days.push({ key: "upcoming", label: "Coming up", entries: upcoming });
  for (const entry of past) {
    const key = indiaDate(new Date(entry.at));
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, label: dayLabel(key, input.now), entries: [entry] });
  }
  return days;
}
