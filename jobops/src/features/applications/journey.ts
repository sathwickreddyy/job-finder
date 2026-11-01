import { inboundEvents, isLinkedReply, isOutreach, recordStateFrom } from "./phase";
import type { ApplicationRecord } from "./read";

export type JourneyStep = {
  label: string;
  at: Date | null;
  state: "reached" | "stopped" | "ahead" | "faded";
  tone: "applied" | "interviewing" | "offer" | "bad" | "muted";
};
export type Journey = { kind: "application" | "outreach"; steps: JourneyStep[] };
export type JourneySource = Pick<
  ApplicationRecord,
  "source" | "status" | "phase" | "closedReason" | "sentAt" | "events" | "rounds" | "linkedMail"
>;

/** A step's name, colour, and the dates that prove it happened, earliest first. */
type Stop = { label: string; tone: JourneyStep["tone"]; evidence: Date[]; implied: boolean };

const interviewEvents = new Set([
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "ROUND_PASSED",
  "ROUND_FAILED",
  "ROUND_RESCHEDULED",
]);
const advancedStages = new Set([
  "ASSESSMENT",
  "RECRUITER_SCREEN",
  "TECHNICAL_INTERVIEW",
  "MANAGER_INTERVIEW",
  "FINAL_INTERVIEW",
]);
const badEnds = new Set(["REJECTION_RECEIVED", "ROUND_FAILED", "REFERRAL_DECLINED"]);
const quietEnds = new Set(["CLOSED_NO_REPLY", "WITHDRAWN"]);

const valid = (dates: (Date | null | undefined)[]) =>
  dates.filter((date): date is Date => !!date && Number.isFinite(date.getTime()));
const earliest = (dates: Date[]) =>
  dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
const latest = (dates: Date[]) =>
  dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;

function applicationStops(record: JourneySource, sent: boolean): Stop[] {
  const when = (types: Set<string> | string[]) =>
    valid(
      record.events
        .filter((event) => new Set(types).has(event.eventType))
        .map((event) => event.occurredAt),
    );
  const offered = record.closedReason === "ACCEPTED" || record.closedReason === "DECLINED";
  return [
    { label: "Sent", tone: "applied", evidence: valid([record.sentAt]), implied: sent },
    {
      label: "Acknowledged",
      tone: "applied",
      evidence: [
        ...when(["ACKNOWLEDGEMENT_RECEIVED"]),
        ...valid(
          record.linkedMail
            .filter((mail) => mail.classification === "APPLICATION_ACKNOWLEDGEMENT")
            .map((mail) => mail.receivedAt),
        ),
      ],
      implied: record.status === "ACKNOWLEDGED",
    },
    {
      label: "Interviewing",
      tone: "interviewing",
      evidence: [
        ...when(interviewEvents),
        ...valid(
          record.rounds
            .filter((round) => round.outcome !== "CANCELLED")
            .map((round) => round.scheduledAt),
        ),
      ],
      implied: advancedStages.has(record.status) || record.phase === "Interviewing",
    },
    {
      label: "Offer",
      tone: "offer",
      evidence: when(["OFFER_RECEIVED"]),
      implied: record.status === "OFFER" || record.phase === "Decision" || offered,
    },
  ];
}

function outreachStops(record: JourneySource, sent: boolean, replied: boolean): Stop[] {
  return [
    { label: "Sent", tone: "applied", evidence: valid([record.sentAt]), implied: sent },
    {
      label: "Replied",
      tone: "applied",
      evidence: valid([
        ...record.events
          .filter((event) => inboundEvents.has(event.eventType))
          .map((event) => event.occurredAt),
        ...record.linkedMail.filter(isLinkedReply).map((mail) => mail.receivedAt),
      ]),
      implied: replied,
    },
    {
      label: "Referred",
      tone: "offer",
      evidence: valid(
        record.events
          .filter((event) => event.eventType === "REFERRAL_SUBMITTED")
          .map((event) => event.occurredAt),
      ),
      implied: false,
    },
  ];
}

/**
 * How far an application got (spec §4): each step is reached when it or a later one has
 * evidence. A rejection takes the place of the first step not reached and later steps fade;
 * any other close does the same in a muted tone. Accepted or declined offers keep every step.
 */
export function journeyOf(record: JourneySource): Journey {
  const outreach = isOutreach(record.source);
  const state = recordStateFrom(
    { ...record, appliedAt: record.sentAt },
    record.rounds,
    record.events.map((event) => event.eventType),
  );
  const stops = outreach
    ? outreachStops(record, state.sent, state.replied)
    : applicationStops(record, state.sent);
  const reachedUpTo = stops.reduce(
    (furthest, stop, index) => (stop.evidence.length || stop.implied ? index : furthest),
    -1,
  );
  const settledOffer = record.closedReason === "ACCEPTED" || record.closedReason === "DECLINED";
  const closed = record.phase === "Closed" && !settledOffer;
  const bad = record.closedReason === "REJECTED" || record.status === "REJECTED";
  const stopAt = closed && reachedUpTo + 1 < stops.length ? reachedUpTo + 1 : null;
  const declinedReferral = record.events.some((event) => event.eventType === "REFERRAL_DECLINED");
  const endedAt = latest(
    valid(
      record.events
        .filter((event) => (bad ? badEnds : quietEnds).has(event.eventType))
        .map((event) => event.occurredAt),
    ),
  );
  const steps = stops.map((stop, index): JourneyStep => {
    if (index === stopAt)
      return {
        label: !bad ? "Closed" : outreach && declinedReferral ? "Not able to refer" : "Rejected",
        at: endedAt,
        state: "stopped",
        tone: bad ? "bad" : "muted",
      };
    if (stopAt !== null && index > stopAt)
      return { label: stop.label, at: null, state: "faded", tone: stop.tone };
    if (index <= reachedUpTo)
      return { label: stop.label, at: earliest(stop.evidence), state: "reached", tone: stop.tone };
    return {
      label: index === 0 && !state.sent ? "Not sent" : stop.label,
      at: null,
      state: "ahead",
      tone: stop.tone,
    };
  });
  return { kind: outreach ? "outreach" : "application", steps };
}

/**
 * The outcome the mail rule recorded from an email, while it is still the application's latest
 * outcome; that is when its Undo shows (spec §1, Undo).
 */
export function autoOutcomeOf(
  record: Pick<JourneySource, "events">,
): { mailMessageId: string; outcome: string; at: Date } | null {
  const latest = record.events
    .filter((event) => typeof event.payload.outcome === "string")
    .reduce<JourneySource["events"][number] | null>(
      (newest, event) => (!newest || event.createdAt > newest.createdAt ? event : newest),
      null,
    );
  if (!latest || latest.payload.auto !== true || typeof latest.payload.mailMessageId !== "string")
    return null;
  return {
    mailMessageId: latest.payload.mailMessageId,
    outcome: latest.payload.outcome as string,
    at: latest.occurredAt,
  };
}
