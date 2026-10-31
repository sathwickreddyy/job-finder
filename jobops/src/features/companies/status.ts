import { laneStatus, type LaneSource, type StatusTone } from "@/features/applications/lanes";
import { PREVIOUS_JOB, type PreviousJob } from "./previous-source";

export type CompanyStatusTone = StatusTone | "accepted" | "mailOnly" | "none";
/** One derived status per company, never hand-picked; a previous job is a badge beside it. */
export type CompanyStatus = {
  tone: CompanyStatusTone;
  label: string;
  detail: string;
  previous: { role: string; joined: string; left: string | null } | null;
};

const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
/** "2022-04" as "Apr 2022". */
export const monthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return months[month - 1] ? `${months[month - 1]} ${year}` : value;
};

const toneLabel: Record<CompanyStatusTone, string> = {
  preparing: "Preparing",
  applied: "Applied",
  quiet: "Quiet",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
  accepted: "Accepted",
  mailOnly: "Mail only",
  none: "No live application",
};

/**
 * The company's status from its live records (previous jobs never count): the lead record's
 * lane tone, Accepted when a current offer was accepted, Mail only when there is job mail
 * but no record.
 */
export function companyStatus(input: {
  records: LaneSource[];
  mailCount: number;
  previousJobs: PreviousJob[];
  now: Date;
}): CompanyStatus {
  const latest = input.previousJobs.toSorted((a, b) => b.joinedOn.localeCompare(a.joinedOn))[0];
  const previous = latest
    ? { role: latest.role, joined: latest.joinedOn, left: latest.leftOn }
    : null;
  const live = input.records.filter((record) => record.source !== PREVIOUS_JOB);
  const status = (tone: CompanyStatusTone, detail = toneLabel[tone]): CompanyStatus => ({
    tone,
    label: toneLabel[tone],
    detail,
    previous,
  });
  if (!live.length) return input.mailCount ? status("mailOnly") : status("none");
  const lane = laneStatus(live, input.now);
  const allClosed = live.every((record) => record.phase === "Closed");
  if (allClosed && live.some((record) => record.closedReason === "ACCEPTED"))
    return status("accepted", lane.label);
  return status(lane.tone, lane.label);
}
