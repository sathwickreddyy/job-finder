import { z } from "zod";
import type { applicationStages, closeReasons, roundOutcomes } from "@/db/schema";
import { roundKindLabel } from "@/features/companies/metrics";
import { indiaDayBoundary } from "@/features/mail/attention";
import { roundKinds, type RoundKind } from "@/lib/round-kinds";
import { formatDayTime, indiaDate, istDateTime, istDayStart } from "./dates";

export type Stage = (typeof applicationStages)[number];
export type CloseReason = (typeof closeReasons)[number];
export type RoundOutcome = (typeof roundOutcomes)[number];
export const phases = ["Preparing", "Applied", "Interviewing", "Decision", "Closed"] as const;
export type Phase = (typeof phases)[number];

const outreachSources = ["REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"];
export const isOutreach = (source: string) => outreachSources.includes(source);
export const methodLabel: Record<string, string> = {
  DIRECT: "Applied directly",
  REFERRAL: "Referral ask",
  COLD_EMAIL: "Cold email",
  LINKEDIN_MESSAGE: "LinkedIn message",
};

/** Events that mean the other side responded. Automatic acknowledgements do not count. */
export const inboundEvents = new Set([
  "REPLY_RECEIVED",
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "ROUND_PASSED",
  "ROUND_FAILED",
  "ROUND_RESCHEDULED",
  "OFFER_RECEIVED",
  "REJECTION_RECEIVED",
  "REFERRAL_SUBMITTED",
  "REFERRAL_DECLINED",
  "FOLLOW_UP_RECEIVED",
  "RECRUITER_OUTREACH",
]);

export type RecordState = {
  source: string;
  status: Stage;
  sent: boolean;
  replied: boolean;
  referred: boolean;
  rounds: { kind: RoundKind; outcome: RoundOutcome; scheduledAt: Date | null }[];
};

export function recordStateFrom(
  app: {
    source: string;
    status: Stage;
    appliedAt: Date | null;
    linkedMail?: { classification: string; receivedAt: Date }[];
    events?: { eventType: string; occurredAt: Date }[];
  },
  rounds: RecordState["rounds"],
  eventTypes: string[],
): RecordState {
  // Older records can predate OUTREACH_SENT. A submitted/advanced stage or a
  // real response still establishes sending; acknowledgement alone is not a reply.
  const advanced = [
    "ASSESSMENT",
    "RECRUITER_SCREEN",
    "TECHNICAL_INTERVIEW",
    "MANAGER_INTERVIEW",
    "FINAL_INTERVIEW",
    "OFFER",
  ].includes(app.status);
  const types = new Set([...eventTypes, ...(app.events ?? []).map((event) => event.eventType)]);
  const linkedInbound = (app.linkedMail ?? []).filter(
    (mail) => mail.classification !== "APPLICATION_ACKNOWLEDGEMENT",
  );
  const hasResponse =
    [...types].some((type) => inboundEvents.has(type)) || linkedInbound.length > 0 || advanced;
  const latestAt = (dates: Date[]) =>
    dates.reduce<number | null>((latest, date) => {
      const at = date.getTime();
      return Number.isFinite(at) && (latest === null || at > latest) ? at : latest;
    }, null);
  const inboundAt = latestAt([
    ...(app.events ?? [])
      .filter((event) => inboundEvents.has(event.eventType))
      .map((event) => event.occurredAt),
    ...linkedInbound.map((mail) => mail.receivedAt),
  ]);
  const followupAt = latestAt(
    (app.events ?? [])
      .filter((event) => event.eventType === "FOLLOW_UP_SENT")
      .map((event) => event.occurredAt),
  );
  // Type-only callers retain historical behavior. When dates are known, a later
  // outreach follow-up starts awaiting a fresh reply, just like silenceClock.
  const replied =
    hasResponse &&
    !(
      isOutreach(app.source) &&
      inboundAt !== null &&
      followupAt !== null &&
      followupAt > inboundAt
    );
  return {
    source: app.source,
    status: app.status,
    sent:
      app.appliedAt !== null ||
      types.has("OUTREACH_SENT") ||
      types.has("APPLICATION_SUBMITTED") ||
      hasResponse ||
      app.status === "APPLIED" ||
      app.status === "ACKNOWLEDGED",
    replied,
    referred: types.has("REFERRAL_SUBMITTED"),
    rounds,
  };
}

export function phaseOf(state: Pick<RecordState, "source" | "status" | "sent">): Phase {
  if (state.status === "REJECTED" || state.status === "WITHDRAWN" || state.status === "CLOSED")
    return "Closed";
  if (isOutreach(state.source)) return state.sent ? "Applied" : "Preparing";
  if (
    state.status === "DRAFT" ||
    state.status === "PREPARING" ||
    state.status === "READY_FOR_REVIEW"
  )
    return "Preparing";
  if (state.status === "APPLIED" || state.status === "ACKNOWLEDGED") return "Applied";
  if (state.status === "OFFER") return "Decision";
  return "Interviewing";
}

/** Only unsent Preparing records may be rewritten by the retained plan editor. */
export function canEditPlannedRecord(state: Pick<RecordState, "source" | "status" | "sent">) {
  return !state.sent && phaseOf(state) === "Preparing";
}

const closeReasonLabel: Record<CloseReason, string> = {
  REJECTED: "Rejected",
  NO_REPLY: "Closed, no reply",
  WITHDREW: "Withdrew",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};
const legacyClosed: Partial<Record<Stage, string>> = {
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrew",
  CLOSED: "Closed",
};

export function phaseText(input: {
  phase: Phase;
  source: string;
  replied: boolean;
  closedReason: CloseReason | null;
  status: Stage;
  rounds: number;
  typical: number | null;
}) {
  if (input.phase === "Closed")
    return input.closedReason
      ? closeReasonLabel[input.closedReason]
      : (legacyClosed[input.status] ?? "Closed");
  if (isOutreach(input.source))
    return input.phase === "Preparing" ? "Preparing" : input.replied ? "Replied" : "Sent";
  if (input.phase === "Interviewing" && input.rounds)
    return `Interviewing · round ${input.rounds}${input.typical && input.typical >= input.rounds ? ` of ${input.typical}` : ""}`;
  return input.phase;
}

export const outcomeIds = [
  "heard",
  "replied",
  "oa",
  "scheduled",
  "followup",
  "passed",
  "failed",
  "rescheduled",
  "offer",
  "rejected",
  "ghosted",
  "withdrew",
  "accepted",
  "declined",
  "referred",
  "declinedReferral",
] as const;
export type OutcomeId = (typeof outcomeIds)[number];
export const outcomeMeta: Record<
  OutcomeId,
  { label: string; tone: "good" | "bad" | "neutral"; needs?: "round" | "deadline" | "time" }
> = {
  heard: { label: "Heard back", tone: "neutral" },
  replied: { label: "Replied", tone: "good" },
  oa: { label: "Got an OA", tone: "good", needs: "deadline" },
  scheduled: { label: "Round scheduled", tone: "good", needs: "round" },
  followup: { label: "Sent a follow-up", tone: "neutral" },
  passed: { label: "Cleared the round", tone: "good" },
  failed: { label: "Didn't clear it", tone: "bad" },
  rescheduled: { label: "Rescheduled", tone: "neutral", needs: "time" },
  offer: { label: "Got an offer", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  ghosted: { label: "No reply, close it", tone: "bad" },
  withdrew: { label: "I withdrew", tone: "neutral" },
  accepted: { label: "Accepted the offer", tone: "good" },
  declined: { label: "Declined the offer", tone: "neutral" },
  referred: { label: "Referral submitted", tone: "good" },
  declinedReferral: { label: "Not able to refer", tone: "bad" },
};

/** Only the outcomes that make sense from where the record stands (spec §3.1). */
export function availableOutcomes(state: RecordState): OutcomeId[] {
  const phase = phaseOf(state);
  if (phase === "Closed" || phase === "Preparing") return [];
  if (isOutreach(state.source)) {
    if (!state.replied) return ["replied", "followup", "ghosted"];
    return state.referred ? ["withdrew"] : ["referred", "declinedReferral", "withdrew"];
  }
  if (phase === "Decision") return ["accepted", "declined"];
  if (state.rounds.some((round) => round.outcome === "SCHEDULED"))
    return ["passed", "failed", "rescheduled", "rejected", "withdrew"];
  if (phase === "Interviewing")
    return ["scheduled", "offer", "followup", "rejected", "ghosted", "withdrew"];
  return ["heard", "oa", "scheduled", "followup", "rejected", "ghosted", "withdrew"];
}

/** A requested outcome (from a queue or mail link) is preselected only when it applies. */
export function initialOutcome(available: OutcomeId[], requested: string | undefined) {
  if (requested === "heard" && available.includes("replied")) return "replied";
  return available.find((id) => id === requested) ?? null;
}

export type OutcomeDetail = {
  kind?: RoundKind;
  at?: Date;
  name: string;
  note: string;
  happenedAt: Date;
};
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const outcomeInput = z.object({
  outcome: z.enum(outcomeIds),
  kind: z.enum(roundKinds).optional(),
  day: z.string().regex(dayPattern).optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  name: z.string().trim().max(200).default(""),
  note: z.string().trim().max(2000).default(""),
  happenedOn: z.string().regex(dayPattern).optional(),
});

export function outcomeDetail(input: z.input<typeof outcomeInput>, now: Date) {
  const data = outcomeInput.parse(input);
  const needs = outcomeMeta[data.outcome].needs;
  let at: Date | undefined;
  if (needs) {
    if (!data.day)
      throw new Error(
        needs === "deadline"
          ? "Choose the date the OA must be completed by."
          : "Choose the date of the round.",
      );
    // Validate the date before missing kind/time, so rollovers never slip through.
    if (!indiaDayBoundary(data.day)) throw new Error("Use a valid date and time in India time.");
    if (needs === "round" && !data.kind) throw new Error("Choose the kind of round.");
    if (needs !== "deadline" && !data.time)
      throw new Error("Choose the time of the round in India time.");
    at = istDateTime(data.day, data.time || "23:59");
    if (!at) throw new Error("Use a valid date and time in India time.");
  }
  let happenedAt = now;
  if (data.happenedOn) {
    const start = indiaDayBoundary(data.happenedOn);
    if (!start) throw new Error("Use a valid date for when it happened.");
    if (start > istDayStart(now)) throw new Error("When it happened cannot be in the future.");
    // Noon IST records a backdated event within its chosen local calendar day.
    if (indiaDate(start) !== indiaDate(now)) happenedAt = new Date(start.getTime() + 43_200_000);
  }
  const detail: OutcomeDetail = {
    kind: data.kind,
    at,
    name: data.name,
    note: data.note,
    happenedAt,
  };
  return { id: data.outcome, detail };
}

export type OutcomePlan = {
  status: Stage;
  closedReason: CloseReason | null;
  round?:
    | { action: "insert"; kind: RoundKind; name: string; scheduledAt: Date }
    | { action: "settle"; outcome: "PASSED" | "FAILED" }
    | { action: "move"; scheduledAt: Date };
  eventType: string;
  summary: string;
};

export function planOutcome(state: RecordState, id: OutcomeId, detail: OutcomeDetail): OutcomePlan {
  const allowed = availableOutcomes(state);
  if (!allowed.includes(id))
    throw new Error(
      `${outcomeMeta[id].label} does not apply to a record in ${phaseOf(state)}${
        allowed.length
          ? `. Choose: ${allowed.map((option) => outcomeMeta[option].label).join(", ")}`
          : ""
      }.`,
    );
  const needs = outcomeMeta[id].needs;
  if (needs && (!detail.at || Number.isNaN(detail.at.getTime())))
    throw new Error("Use a valid date and time in India time.");
  if (needs === "round" && (!detail.kind || !roundKinds.includes(detail.kind)))
    throw new Error("Choose the kind of round.");
  const booked = state.rounds.find((round) => round.outcome === "SCHEDULED");
  const kind = booked ? roundKindLabel[booked.kind] : "";
  const keep: Pick<OutcomePlan, "status" | "closedReason"> = {
    status: state.status,
    closedReason: null,
  };
  const close = (status: Stage, closedReason: CloseReason) => ({ status, closedReason });
  switch (id) {
    case "heard":
      return {
        status: state.status === "APPLIED" ? "ACKNOWLEDGED" : state.status,
        closedReason: null,
        eventType: "REPLY_RECEIVED",
        summary: "Heard back",
      };
    case "replied":
      return {
        ...keep,
        status: state.status === "APPLIED" ? "ACKNOWLEDGED" : state.status,
        eventType: "REPLY_RECEIVED",
        summary: "Replied",
      };
    case "followup":
      return { ...keep, eventType: "FOLLOW_UP_SENT", summary: "Sent a follow-up" };
    case "oa":
      return {
        status: "ASSESSMENT",
        closedReason: null,
        round: {
          action: "insert",
          kind: "ONLINE_ASSESSMENT",
          name: detail.name || "Online assessment",
          scheduledAt: detail.at!,
        },
        eventType: "ASSESSMENT_RECEIVED",
        summary: `OA received, complete by ${formatDayTime(detail.at!)}`,
      };
    case "scheduled": {
      const roundKind = detail.kind!;
      return {
        status:
          roundKind === "BEHAVIORAL" || roundKind === "HIRING_MANAGER"
            ? "MANAGER_INTERVIEW"
            : "TECHNICAL_INTERVIEW",
        closedReason: null,
        round: {
          action: "insert",
          kind: roundKind,
          name: detail.name || roundKindLabel[roundKind],
          scheduledAt: detail.at!,
        },
        eventType: "INTERVIEW_SCHEDULED",
        summary: `${roundKindLabel[roundKind]} round scheduled for ${formatDayTime(detail.at!)}`,
      };
    }
    case "rescheduled":
      return {
        ...keep,
        round: { action: "move", scheduledAt: detail.at! },
        eventType: "ROUND_RESCHEDULED",
        summary: `${kind} round moved to ${formatDayTime(detail.at!)}`,
      };
    case "passed":
      return {
        ...keep,
        round: { action: "settle", outcome: "PASSED" },
        eventType: "ROUND_PASSED",
        summary: `Cleared the ${kind} round`,
      };
    case "failed":
      return {
        ...close("REJECTED", "REJECTED"),
        round: { action: "settle", outcome: "FAILED" },
        eventType: "ROUND_FAILED",
        summary: `Did not clear the ${kind} round`,
      };
    case "offer":
      return {
        status: "OFFER",
        closedReason: null,
        eventType: "OFFER_RECEIVED",
        summary: "Offer received",
      };
    case "rejected":
      return {
        ...close("REJECTED", "REJECTED"),
        eventType: "REJECTION_RECEIVED",
        summary: "Rejected",
      };
    case "ghosted":
      return {
        ...close("CLOSED", "NO_REPLY"),
        eventType: "CLOSED_NO_REPLY",
        summary: "Closed after no reply",
      };
    case "withdrew":
      return { ...close("WITHDRAWN", "WITHDREW"), eventType: "WITHDRAWN", summary: "Withdrew" };
    case "accepted":
      return {
        ...close("CLOSED", "ACCEPTED"),
        eventType: "OFFER_ACCEPTED",
        summary: "Accepted the offer",
      };
    case "declined":
      return {
        ...close("CLOSED", "DECLINED"),
        eventType: "OFFER_DECLINED",
        summary: "Declined the offer",
      };
    case "referred":
      return { ...keep, eventType: "REFERRAL_SUBMITTED", summary: "Referral submitted" };
    case "declinedReferral":
      return {
        ...close("CLOSED", "REJECTED"),
        eventType: "REFERRAL_DECLINED",
        summary: "Not able to refer",
      };
  }
}

const goodEvents = new Set([
  "ROUND_PASSED",
  "OFFER_RECEIVED",
  "OFFER_ACCEPTED",
  "REFERRAL_SUBMITTED",
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_REQUESTED",
  "REPLY_RECEIVED",
]);
const badEvents = new Set([
  "ROUND_FAILED",
  "REJECTION_RECEIVED",
  "CLOSED_NO_REPLY",
  "REFERRAL_DECLINED",
]);
export function historyTone(eventType: string): "good" | "bad" | "neutral" {
  return goodEvents.has(eventType) ? "good" : badEvents.has(eventType) ? "bad" : "neutral";
}
