import { roundKindLabel } from "@/features/companies/metrics";
import { suggestedOutcome, type TriageInput } from "@/features/mail/triage";
import {
  addDays,
  formatDay,
  formatTime,
  formatWeekday,
  istDayStart,
  istDaysBetween,
} from "./dates";
import { laneHref } from "./navigation";
import {
  historyTone,
  isOutreach,
  methodLabel,
  recordStateFrom,
  type OutcomeId,
  type Phase,
} from "./phase";
import { silenceClock, type Due, type QueueItem } from "./queue";
import type { ApplicationRecord } from "./read";

/* ---------- Company keys (spec §2.1) ---------- */

export const normalizeCompany = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

/** Maps a job's company text onto its lane; listed names and aliases join the company record. */
export function companyResolver(companies: { name: string; aliases: string[] }[]) {
  const canonical = new Map<string, string>();
  for (const company of companies)
    for (const name of [company.name, ...company.aliases])
      canonical.set(normalizeCompany(name), company.name);
  return (company: string) => {
    const name = canonical.get(normalizeCompany(company)) ?? company.trim().replace(/\s+/g, " ");
    return { companyKey: normalizeCompany(name), companyName: name };
  };
}

/* ---------- Status (spec §2.2) ---------- */

export type LaneSource = Pick<
  ApplicationRecord,
  | "id"
  | "jobId"
  | "company"
  | "companyKey"
  | "companyName"
  | "role"
  | "city"
  | "source"
  | "status"
  | "contact"
  | "sentAt"
  | "nextActionAt"
  | "nextActionNote"
  | "rounds"
  | "events"
  | "linkedMail"
  | "closedReason"
  | "phase"
  | "typicalRounds"
  | "postedAt"
>;
export type StatusTone =
  "preparing" | "applied" | "quiet" | "interviewing" | "offer" | "rejected" | "closed";
export type LaneStatus = { tone: StatusTone; label: string };

function closedStatus(record: LaneSource): LaneStatus {
  switch (record.closedReason) {
    case "ACCEPTED":
      return { tone: "offer", label: "Accepted the offer" };
    case "DECLINED":
      return { tone: "closed", label: "Declined the offer" };
    case "NO_REPLY":
      return { tone: "closed", label: "Closed, no reply" };
    case "WITHDREW":
      return { tone: "closed", label: record.sentAt ? "Withdrew" : "Not applying" };
  }
  if (record.closedReason === "REJECTED" || record.status === "REJECTED") {
    const settled = record.rounds
      .filter((round) => round.outcome === "PASSED" || round.outcome === "FAILED")
      .at(-1);
    return {
      tone: "rejected",
      label: settled ? `Rejected after ${roundKindLabel[settled.kind]}` : "Rejected",
    };
  }
  return { tone: "closed", label: record.status === "WITHDRAWN" ? "Withdrew" : "Closed" };
}

/** One record's status in plain words, derived from recorded facts only. */
export function recordStatus(record: LaneSource, now: Date): LaneStatus {
  if (record.phase === "Preparing") return { tone: "preparing", label: "Not sent" };
  if (record.phase === "Closed") return closedStatus(record);
  if (record.phase === "Decision")
    return {
      tone: "offer",
      label: record.nextActionAt
        ? `Offer · decide by ${formatDay(record.nextActionAt)}`
        : "Offer received",
    };
  if (record.phase === "Interviewing") {
    const unsettled = record.rounds.filter((round) => round.outcome === "SCHEDULED");
    if (unsettled.length === 1 && unsettled[0].kind === "ONLINE_ASSESSMENT")
      return { tone: "interviewing", label: "Online assessment" };
    const rounds = record.rounds.filter((round) => round.outcome !== "CANCELLED").length;
    if (!rounds) return { tone: "interviewing", label: "Interviewing" };
    const of =
      record.typicalRounds && record.typicalRounds >= rounds ? ` of ${record.typicalRounds}` : "";
    return { tone: "interviewing", label: `Interviewing · round ${rounds}${of}` };
  }
  const outreach = isOutreach(record.source);
  const method = methodLabel[record.source] ?? "Outreach";
  if (
    outreach &&
    recordStateFrom({ ...record, appliedAt: record.sentAt }, record.rounds, []).replied
  )
    return { tone: "applied", label: `${method} · replied` };
  const clock = silenceClock(record, now);
  const sent = record.status === "ACKNOWLEDGED" ? "Acknowledged" : "Applied";
  if (!clock) return { tone: "applied", label: outreach ? method : sent };
  if (clock.days >= clock.threshold)
    return {
      tone: "quiet",
      label: outreach ? `${method} · ${clock.days} days quiet` : `Quiet ${clock.days} days`,
    };
  return {
    tone: "applied",
    label: outreach ? `${method} · ${clock.days} of ${clock.threshold} days` : sent,
  };
}

const phaseRank: Record<Phase, number> = {
  Decision: 4,
  Interviewing: 3,
  Applied: 2,
  Preparing: 1,
  Closed: 0,
};
const timeOf = (value: Date | null) =>
  value && Number.isFinite(value.getTime()) ? value.getTime() : 0;

/** The latest dated thing that happened on a record. */
export function activityOf(record: LaneSource) {
  return Math.max(
    timeOf(record.sentAt),
    ...record.events.map((event) => timeOf(event.occurredAt)),
    ...record.linkedMail.map((mail) => timeOf(mail.receivedAt)),
  );
}

/** The furthest-along open record; when every record is closed, the most recently active one. */
export function leadOf<T extends LaneSource>(records: T[]): T {
  return [...records].sort(
    (a, b) => phaseRank[b.phase] - phaseRank[a.phase] || activityOf(b) - activityOf(a),
  )[0];
}

/** The lead's status, with " · new email" and " · +K role(s)" for other open openings. */
export function laneStatus(records: LaneSource[], now: Date, pendingMail = false): LaneStatus {
  const lead = leadOf(records);
  const status = recordStatus(lead, now);
  const otherJobs = new Set(
    records
      .filter((record) => record.phase !== "Closed" && record.jobId !== lead.jobId)
      .map((record) => record.jobId),
  ).size;
  const mail = pendingMail && lead.phase === "Applied" ? " · new email" : "";
  const more = otherJobs ? ` · +${otherJobs} ${otherJobs === 1 ? "role" : "roles"}` : "";
  return { tone: status.tone, label: `${status.label}${mail}${more}` };
}

/* ---------- Tones and matched mail (spec §2.3) ---------- */

export type DotTone = "sent" | "mail" | "good" | "bad" | "note" | "upcoming" | "pending";
export type PendingMail = {
  id: string;
  recordId: string;
  subject: string;
  classification: string;
  receivedAt: Date;
  outcome: OutcomeId | null;
};

const sentEvents = new Set([
  "APPLICATION_SENT",
  "APPLICATION_SUBMITTED",
  "OUTREACH_SENT",
  "FOLLOW_UP_SENT",
]);
const replyEvents = new Set([
  "REPLY_RECEIVED",
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "ROUND_RESCHEDULED",
]);
/** Single-line text clipped with an ellipsis. */
export function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** First match wins: bad, sent, reply (mail only when it came from mail), good, note. */
export function eventTone(eventType: string, fromMail: boolean): DotTone {
  if (historyTone(eventType) === "bad") return "bad";
  if (sentEvents.has(eventType)) return "sent";
  if (replyEvents.has(eventType)) return fromMail ? "mail" : "note";
  return historyTone(eventType) === "good" ? "good" : "note";
}

/** Open mail the triage matched to a record: updates and acknowledgements (spec §3). */
export function pendingMailFrom(messages: TriageInput[]): PendingMail[] {
  return messages.flatMap((message) =>
    message.record &&
    (message.bucket === "updates" || message.classification === "APPLICATION_ACKNOWLEDGEMENT")
      ? [
          {
            id: message.id,
            recordId: message.record.id,
            subject: message.subject,
            classification: message.classification,
            receivedAt: message.receivedAt,
            outcome: suggestedOutcome[message.classification],
          },
        ]
      : [],
  );
}

/* ---------- Next step (spec §2.4) ---------- */

export type LaneNext = {
  recordId: string;
  due: Due | null;
  at: Date | null;
  when: string;
  text: string;
  action: string;
  href: string;
};
export type LaneRole = {
  recordId: string;
  role: string;
  city: string;
  source: string;
  phase: Phase;
  status: LaneStatus;
  next: LaneNext | null;
};
export type LaneGroup = "needs" | "active" | "closed";
export type Lane = {
  key: string;
  company: string;
  leadId: string;
  roles: LaneRole[];
  status: LaneStatus;
  next: LaneNext | null;
  group: LaneGroup;
  lastActivity: number;
};

/** "Tue 3 Nov" in India time. */
const dayName = (value: Date) => formatWeekday(value).replace(",", "");

/** "Overdue since 9 Oct", "Today, 3:00 pm", "By Tue 3 Nov" or "Tue 3 Nov, 3:00 pm" (spec §3). */
function whenText(item: QueueItem) {
  if (item.reason === "mail") return "New email";
  const timed = item.reason === "round" || item.reason === "deadline";
  if (item.due === "overdue") return `Overdue since ${formatDay(item.dueAt)}`;
  if (item.due === "today") return timed ? `Today, ${formatTime(item.dueAt)}` : "Today";
  return timed ? `${dayName(item.dueAt)}, ${formatTime(item.dueAt)}` : `By ${dayName(item.dueAt)}`;
}

/** Apply only to openings published within the last 14 India calendar days, inclusive. */
const FRESH_DAYS = 14;

/** An unsent record's next step follows the freshness policy (spec §4). */
function preparingNext(record: LaneSource, now: Date, href: string): LaneNext {
  const base = { recordId: record.id, due: null, href };
  if (!record.postedAt)
    return {
      ...base,
      at: null,
      when: "Posting date unknown",
      text: "Check the posting date",
      action: "Open",
    };
  const age = istDaysBetween(record.postedAt, now);
  if (age <= FRESH_DAYS) {
    const deadline = addDays(istDayStart(record.postedAt), FRESH_DAYS);
    return {
      ...base,
      at: deadline,
      when: "Not sent",
      text: `Apply by ${dayName(deadline)}`,
      action: "Record application",
    };
  }
  return {
    ...base,
    at: null,
    when: "Not sent",
    text: `Posting is ${age} days old`,
    action: "Not applying",
  };
}

/** Matched mail first (linking it usually settles the rest), else the first queue item, else a fallback. */
export function recordNext(
  record: LaneSource,
  items: QueueItem[],
  pending: PendingMail[],
  now: Date,
): LaneNext | null {
  const mine = pending
    .filter((mail) => mail.recordId === record.id)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  // Acknowledgements are noise in the global queue but still need a manual lane decision.
  const mail = mine[0];
  if (mail)
    return {
      recordId: record.id,
      due: "today",
      at: mail.receivedAt,
      when: "New email",
      text: clip(mail.subject, 120),
      action: mail.outcome ? "Link it" : "Add to timeline",
      href: laneHref(record.id, { mail: mail.id, outcome: mail.outcome }),
    };
  const item = items.find((entry) => entry.recordId === record.id);
  const href = laneHref(record.id);
  if (item) {
    const base = { recordId: record.id, due: item.due, at: item.dueAt, when: whenText(item) };
    if (item.reason === "silence")
      return {
        ...base,
        text: item.title,
        action: "I followed up",
        href: laneHref(record.id, { outcome: "followup" }),
      };
    const settle = (item.reason === "round" || item.reason === "deadline") && item.dueAt <= now;
    return { ...base, text: item.title, action: settle ? "Record result" : "Open", href };
  }
  if (record.phase === "Closed") return null;
  if (record.phase === "Preparing") return preparingNext(record, now, href);
  const clock = silenceClock(record, now);
  if (!clock) return null;
  const at = addDays(istDayStart(clock.since), clock.threshold);
  return {
    recordId: record.id,
    due: null,
    at,
    when: `By ${dayName(at)}`,
    text: "Follow up if it stays quiet",
    action: "Open",
    href,
  };
}

const dueRank: Record<Due, number> = { overdue: 0, today: 1, week: 2 };
const nextRank = (next: LaneNext | null) => (!next ? 4 : next.due ? dueRank[next.due] : 3);
const nextTime = (next: LaneNext | null) => next?.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
const groupRank: Record<LaneGroup, number> = { needs: 0, active: 1, closed: 2 };

/**
 * One lane per company key (or per application with `by: "application"`), sorted needs →
 * active → closed (spec §2.5). Previous jobs are history and never get a lane.
 */
export function buildLanes(input: {
  records: LaneSource[];
  items: QueueItem[];
  pending: PendingMail[];
  now: Date;
  by?: "company" | "application";
}): Lane[] {
  const { now } = input;
  const byKey = new Map<string, LaneSource[]>();
  for (const record of input.records) {
    if (record.source === "PREVIOUS_JOB") continue;
    const key = input.by === "application" ? record.id : record.companyKey;
    byKey.set(key, [...(byKey.get(key) ?? []), record]);
  }
  const lanes: Lane[] = [];
  for (const [key, records] of byKey) {
    const lead = leadOf(records);
    const latest = [...records].sort((a, b) => activityOf(b) - activityOf(a))[0];
    const pending = input.pending.filter((mail) =>
      records.some((record) => record.id === mail.recordId),
    );
    const openJobs = new Set(
      records.filter((record) => record.phase !== "Closed").map((record) => record.jobId),
    );
    const roles: LaneRole[] = records
      .map((record) => ({
        recordId: record.id,
        role: record.role,
        city: record.city,
        source: record.source,
        phase: record.phase,
        status: recordStatus(record, now),
        next: recordNext(record, input.items, input.pending, now),
      }))
      .sort(
        (a, b) =>
          Number(b.recordId === lead.id) - Number(a.recordId === lead.id) ||
          phaseRank[b.phase] - phaseRank[a.phase],
      );
    const next =
      roles
        .flatMap((role) =>
          role.next
            ? [
                openJobs.size > 1
                  ? { ...role.next, text: `${role.role}: ${role.next.text}` }
                  : role.next,
              ]
            : [],
        )
        .sort((a, b) => nextRank(a) - nextRank(b) || nextTime(a) - nextTime(b))[0] ?? null;
    const closed = records.every((record) => record.phase === "Closed");
    lanes.push({
      key,
      company: latest.companyName,
      leadId: lead.id,
      roles,
      status: laneStatus(records, now, pending.length > 0),
      next,
      group:
        pending.length > 0
          ? "needs"
          : closed
            ? "closed"
            : next?.due === "overdue" ||
                next?.due === "today" ||
                records.some((record) => record.phase === "Preparing")
              ? "needs"
              : "active",
      lastActivity: Math.max(0, ...records.map(activityOf)),
    });
  }
  return lanes.sort(
    (a, b) =>
      groupRank[a.group] - groupRank[b.group] ||
      (a.group === "closed"
        ? 0
        : nextRank(a.next) - nextRank(b.next) || nextTime(a.next) - nextTime(b.next)) ||
      b.lastActivity - a.lastActivity,
  );
}
