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
>;
export type StatusTone = "preparing" | "applied" | "quiet" | "interviewing" | "offer" | "closed";
export type LaneStatus = { tone: StatusTone; label: string };

const dayWord = (days: number) => (days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days`);

function closedStatus(record: LaneSource): LaneStatus {
  switch (record.closedReason) {
    case "ACCEPTED":
      return { tone: "offer", label: "Accepted the offer" };
    case "DECLINED":
      return { tone: "closed", label: "Declined the offer" };
    case "NO_REPLY":
      return { tone: "closed", label: "Closed, no reply" };
    case "WITHDREW":
      return { tone: "closed", label: "Withdrew" };
  }
  if (record.closedReason === "REJECTED" || record.status === "REJECTED") {
    const settled = record.rounds
      .filter((round) => round.outcome === "PASSED" || round.outcome === "FAILED")
      .at(-1);
    return {
      tone: "closed",
      label: settled ? `Rejected after ${roundKindLabel[settled.kind]}` : "Rejected",
    };
  }
  return { tone: "closed", label: record.status === "WITHDRAWN" ? "Withdrew" : "Closed" };
}

/** One record's status in plain words, derived from recorded facts only. */
export function recordStatus(record: LaneSource, now: Date): LaneStatus {
  if (record.phase === "Preparing") return { tone: "preparing", label: "Not sent yet" };
  if (record.phase === "Closed") return closedStatus(record);
  if (record.phase === "Decision")
    return {
      tone: "offer",
      label: record.nextActionAt
        ? `Offer · decide by ${formatDay(record.nextActionAt)}`
        : "Offer received",
    };
  if (record.phase === "Interviewing") {
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
  if (!clock) return { tone: "applied", label: outreach ? method : "Applied" };
  if (clock.days >= clock.threshold)
    return {
      tone: "quiet",
      label: outreach ? `${method} · ${clock.days} days quiet` : `Quiet for ${clock.days} days`,
    };
  return {
    tone: "applied",
    label: outreach
      ? `${method} · ${clock.days} of ${clock.threshold} days`
      : `Applied · ${dayWord(clock.days)}`,
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

/* ---------- Dots (spec §2.3) ---------- */

export type DotTone = "sent" | "mail" | "good" | "bad" | "note" | "upcoming" | "pending";
export type LaneDot = {
  key: string;
  at: Date;
  tone: DotTone;
  label: string;
  detail: string;
  recordId: string;
  role: string | null;
  via: string | null;
  mailId: string | null;
  outcome: OutcomeId | null;
};
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
const eventLabel: Record<string, string> = {
  APPLICATION_CREATED: "Saved the opening",
  APPLICATION_SENT: "Applied",
  APPLICATION_SUBMITTED: "Applied",
  OUTREACH_SENT: "Reached out",
  FOLLOW_UP_SENT: "Sent a follow-up",
  REPLY_RECEIVED: "Heard back",
  ASSESSMENT_RECEIVED: "Got an OA",
  INTERVIEW_REQUESTED: "Interview requested",
  INTERVIEW_SCHEDULED: "Round scheduled",
  ROUND_PASSED: "Cleared the round",
  ROUND_FAILED: "Didn't clear the round",
  ROUND_RESCHEDULED: "Round rescheduled",
  OFFER_RECEIVED: "Got an offer",
  OFFER_ACCEPTED: "Accepted the offer",
  OFFER_DECLINED: "Declined the offer",
  REJECTION_RECEIVED: "Rejected",
  CLOSED_NO_REPLY: "Closed, no reply",
  WITHDRAWN: "Withdrew",
  REFERRAL_SUBMITTED: "Referral submitted",
  REFERRAL_DECLINED: "Referral declined",
  MANUAL_NOTE: "Note",
  MAIL_UNLINKED: "Email unlinked",
};
const mailLabel: Record<string, string> = {
  INTERVIEW: "Interview email",
  ASSESSMENT: "Assessment invite",
  OFFER: "Offer email",
  REJECTION: "Rejection email",
  FOLLOW_UP: "Recruiter reply",
  RECRUITER_OUTREACH: "Recruiter email",
  APPLICATION_ACKNOWLEDGEMENT: "Automatic “we received it”",
  UNKNOWN: "Email",
};

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

export function laneDots(records: LaneSource[], pending: PendingMail[], now: Date): LaneDot[] {
  const severalJobs = new Set(records.map((record) => record.jobId)).size > 1;
  const dots: LaneDot[] = [];
  for (const record of records) {
    const base = {
      recordId: record.id,
      role: severalJobs ? record.role : null,
      via: isOutreach(record.source) ? (methodLabel[record.source] ?? null) : null,
      mailId: null,
      outcome: null,
    };
    const referenced = new Set(
      record.events
        .map((event) => event.payload.mailMessageId)
        .filter((value): value is string => typeof value === "string"),
    );
    for (const event of record.events) {
      const mailId =
        typeof event.payload.mailMessageId === "string" ? event.payload.mailMessageId : null;
      const summary = clip(event.summary, 80);
      const label = eventLabel[event.eventType] ?? summary;
      dots.push({
        ...base,
        key: `event:${event.id}`,
        at: event.occurredAt,
        tone: eventTone(event.eventType, mailId !== null),
        label,
        detail: label === summary ? "" : clip(event.summary, 160),
        mailId,
      });
    }
    for (const mail of record.linkedMail) {
      if (referenced.has(mail.id)) continue;
      dots.push({
        ...base,
        key: `mail:${mail.id}`,
        at: mail.receivedAt,
        tone: "mail",
        label: mailLabel[mail.classification] ?? "Email",
        detail: clip(mail.subject, 160),
        mailId: mail.id,
      });
    }
    if (!record.events.length && record.sentAt)
      dots.push({
        ...base,
        key: `sent:${record.id}`,
        at: record.sentAt,
        tone: "sent",
        label: isOutreach(record.source) ? "Reached out" : "Applied",
        detail: "",
      });
    for (const round of record.rounds) {
      if (round.outcome !== "SCHEDULED" || !round.scheduledAt) continue;
      dots.push({
        ...base,
        key: `round:${round.id}`,
        at: round.scheduledAt,
        tone: "upcoming",
        label:
          round.kind === "ONLINE_ASSESSMENT"
            ? "OA closes"
            : `Round ${round.position} · ${roundKindLabel[round.kind]}`,
        detail: round.name,
      });
    }
    if (record.nextActionAt && record.phase !== "Closed" && record.nextActionAt > now)
      dots.push({
        ...base,
        key: `followup:${record.id}`,
        at: record.nextActionAt,
        tone: "upcoming",
        label: record.nextActionNote ? clip(record.nextActionNote, 80) : "Follow up",
        detail: "Your follow-up date",
      });
  }
  for (const mail of pending) {
    const record = records.find((item) => item.id === mail.recordId);
    if (!record) continue;
    dots.push({
      key: `pending:${mail.id}`,
      at: mail.receivedAt,
      tone: "pending",
      label: `${mailLabel[mail.classification] ?? "Email"} · not added yet`,
      detail: clip(mail.subject, 160),
      recordId: record.id,
      role: severalJobs ? record.role : null,
      via: null,
      mailId: mail.id,
      outcome: mail.outcome,
    });
  }
  return dots
    .filter((dot) => Number.isFinite(dot.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
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
  dots: LaneDot[];
  next: LaneNext | null;
  group: LaneGroup;
  lastActivity: number;
};

function whenText(item: QueueItem, now: Date) {
  if (item.reason === "mail") return "New email";
  const timed = item.reason === "round" || item.reason === "deadline";
  if (item.due === "overdue") {
    const days = Math.max(1, istDaysBetween(item.dueAt, now));
    return `${days} ${days === 1 ? "day" : "days"} late`;
  }
  if (item.due === "today") return timed ? `Today, ${formatTime(item.dueAt)}` : "Today";
  return timed
    ? `${formatWeekday(item.dueAt)}, ${formatTime(item.dueAt)}`
    : formatWeekday(item.dueAt);
}

/** Matched mail first (linking it usually settles the rest), else the first queue item, else a fallback. */
export function recordNext(
  record: LaneSource,
  items: QueueItem[],
  pending: PendingMail[],
  now: Date,
): LaneNext | null {
  const mine = pending.filter((mail) => mail.recordId === record.id);
  const item =
    items.find(
      (entry) => entry.reason === "mail" && mine.some((mail) => entry.key === `mail:${mail.id}`),
    ) ?? items.find((entry) => entry.recordId === record.id);
  const href = laneHref(record.id);
  if (item) {
    const base = { recordId: record.id, due: item.due, at: item.dueAt, when: whenText(item, now) };
    if (item.reason === "mail") {
      const mail = mine.find((entry) => item.key === `mail:${entry.id}`)!;
      return {
        ...base,
        text: clip(mail.subject, 120),
        action: "Link it",
        href: laneHref(record.id, { mail: mail.id, outcome: mail.outcome }),
      };
    }
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
  if (record.phase === "Preparing")
    return {
      recordId: record.id,
      due: null,
      at: null,
      when: "Not sent",
      text: "Finish and send it",
      action: "Open",
      href,
    };
  const clock = silenceClock(record, now);
  if (!clock) return null;
  const at = addDays(istDayStart(clock.since), clock.threshold);
  return {
    recordId: record.id,
    due: null,
    at,
    when: formatWeekday(at),
    text: "Follow up if it stays quiet",
    action: "Open",
    href,
  };
}

const dueRank: Record<Due, number> = { overdue: 0, today: 1, week: 2 };
const nextRank = (next: LaneNext | null) => (!next ? 4 : next.due ? dueRank[next.due] : 3);
const nextTime = (next: LaneNext | null) => next?.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
const groupRank: Record<LaneGroup, number> = { needs: 0, active: 1, closed: 2 };

/** One lane per company key, sorted needs → active → closed (spec §2.5). */
export function buildLanes(input: {
  records: LaneSource[];
  items: QueueItem[];
  pending: PendingMail[];
  now: Date;
}): Lane[] {
  const { now } = input;
  const byKey = new Map<string, LaneSource[]>();
  for (const record of input.records)
    byKey.set(record.companyKey, [...(byKey.get(record.companyKey) ?? []), record]);
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
      dots: laneDots(records, pending, now),
      next,
      group: closed
        ? "closed"
        : next?.due === "overdue" || next?.due === "today"
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
