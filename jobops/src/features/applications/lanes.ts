import { roundKindLabel } from "@/features/companies/metrics";
import { formatDay } from "./dates";
import { isOutreach, methodLabel, recordStateFrom, type Phase } from "./phase";
import { silenceClock } from "./queue";
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
