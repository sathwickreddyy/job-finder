import { formatDay, formatDayTime } from "./dates";
import { journeyOf, type JourneySource, type JourneyStep } from "./journey";
import { roundLabels } from "./round-label";

export type NamedStep = {
  key: string;
  label: string;
  detail: string;
  state: "done" | "current" | "ahead" | "stopped" | "faded";
  tone: "applied" | "interviewing" | "offer" | "bad" | "muted";
  due?: boolean;
  /** The DOM id of what happened, so the step can link to it; null when nothing was recorded. */
  target: string | null;
};
export type StepSource = JourneySource;
type EventRow = JourneySource["events"][number];

/**
 * What a step links to. The timeline folds an event recorded from an email into that email's row
 * (and drops mail-only events), so those point at `mail-<id>`; no `entry-` card exists for them.
 */
const MAIL_ONLY = new Set(["MAIL_LINKED", "MAIL_UNLINKED", "ACKNOWLEDGEMENT_RECEIVED"]);
function targetOf(event: EventRow | null | undefined): string | null {
  if (!event) return null;
  const mailId = event.payload.mailMessageId;
  if (typeof mailId === "string") return `mail-${mailId}`;
  return MAIL_ONLY.has(event.eventType) ? null : `entry-${event.id}`;
}

const day = (value: Date | null) => (value ? formatDay(value) : "");
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
const earliestEvent = (events: EventRow[]) =>
  events.reduce<EventRow | null>(
    (first, event) => (!first || event.occurredAt < first.occurredAt ? event : first),
    null,
  );
const latestEvent = (events: EventRow[]) =>
  events.reduce<EventRow | null>(
    (last, event) => (!last || event.occurredAt > last.occurredAt ? event : last),
    null,
  );

function roundDetail(round: JourneySource["rounds"][number], now: Date) {
  const at = round.scheduledAt;
  if (round.outcome === "PASSED") return { detail: join("Cleared", day(at)) };
  if (round.outcome === "FAILED") return { detail: join("Not cleared", day(at)) };
  if (!at) return { detail: "Date not set" };
  if (at.getTime() > now.getTime()) return { detail: `Booked ${formatDayTime(at)}` };
  return { detail: join("Result due", day(at)), due: true as const };
}

/**
 * Where an application stands as named steps, built only from what happened: Applied,
 * Acknowledged, an "Interview scheduled" (or "OA received") step and a step for each round, then
 * the outcome. Nothing is predicted. Evidence and close semantics come from `journeyOf`.
 */
export function namedStepsOf(record: StepSource, now: Date): NamedStep[] {
  const journey = journeyOf(record);
  if (journey.kind === "outreach")
    return journey.steps.map((step, index) => ({
      key: `step-${index}`,
      label: step.label,
      detail: day(step.at),
      state: step.state === "reached" ? "done" : step.state,
      tone: step.tone,
      target: null,
    }));

  // The phase decides whether it was sent, as on the row's status pill; linked mail alone does not.
  if (record.phase === "Preparing")
    return [
      {
        key: "applied",
        label: "Not sent",
        detail: "",
        state: "current",
        tone: "applied",
        target: null,
      },
      {
        key: "acknowledged",
        label: "Acknowledged",
        detail: "",
        state: "ahead",
        tone: "applied",
        target: null,
      },
      {
        key: "final",
        label: "Offer / Rejected",
        detail: "",
        state: "ahead",
        tone: "offer",
        target: null,
      },
    ];

  const [sent, acknowledged, interviewing, offer] = journey.steps;
  const reached = (step: JourneyStep) => step.state === "reached";
  const stopped = journey.steps.find((step) => step.state === "stopped");
  const closed = record.phase === "Closed";
  const eventsOf = (...types: string[]) =>
    record.events.filter((event) => types.includes(event.eventType));

  const submitted = earliestEvent(eventsOf("APPLICATION_SUBMITTED", "OUTREACH_SENT"));
  const ackEvent = earliestEvent(eventsOf("ACKNOWLEDGEMENT_RECEIVED"));
  const ackMail = record.linkedMail
    .filter((mail) => mail.classification === "APPLICATION_ACKNOWLEDGEMENT")
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())[0];
  const ackTarget = targetOf(ackEvent) ?? (ackMail ? `mail-${ackMail.id}` : null);

  const steps: NamedStep[] = [
    {
      key: "applied",
      label: sent.label === "Not sent" ? "Not sent" : "Applied",
      detail: day(sent.at),
      state: reached(sent) ? "done" : "ahead",
      tone: "applied",
      target: targetOf(submitted),
    },
  ];
  if (reached(acknowledged))
    steps.push({
      key: "acknowledged",
      label: "Acknowledged",
      detail: day(acknowledged.at),
      state: "done",
      tone: "applied",
      target: ackTarget,
    });

  const rounds = record.rounds
    .filter((round) => round.outcome !== "CANCELLED")
    .sort((a, b) => a.position - b.position);
  const labels = roundLabels(rounds);
  rounds.forEach((round, index) => {
    const oa = round.kind === "ONLINE_ASSESSMENT";
    const announced = earliestEvent(
      eventsOf(oa ? "ASSESSMENT_RECEIVED" : "INTERVIEW_SCHEDULED").filter(
        (event) => event.payload.roundId === round.id,
      ),
    );
    const received = announced?.occurredAt ?? round.createdAt;
    steps.push({
      key: `scheduled-${round.id}`,
      label: oa ? "OA received" : "Interview scheduled",
      detail: round.scheduledAt
        ? `${day(received)} · for ${day(round.scheduledAt)}`
        : day(received),
      state: "done",
      tone: "interviewing",
      target: targetOf(announced),
    });
    const label = labels[index];
    const { detail, due } = roundDetail(round, now);
    const name = round.name.trim();
    steps.push({
      key: `round-${round.id}`,
      label,
      detail: name && !label.endsWith(name) ? join(detail, name) : detail,
      state:
        round.outcome === "PASSED" ? "done" : round.outcome === "FAILED" ? "stopped" : "current",
      tone: "interviewing",
      ...(due ? { due } : {}),
      target: `round-${round.id}`,
    });
  });
  if (!rounds.length && reached(interviewing))
    steps.push({
      key: "interviewing",
      label: "Interviewing",
      detail: day(interviewing.at),
      state: "done",
      tone: "interviewing",
      target: null,
    });

  const rejected = record.closedReason === "REJECTED" || record.status === "REJECTED";
  const settled =
    record.closedReason === "ACCEPTED"
      ? "Accepted"
      : record.closedReason === "DECLINED"
        ? "Declined"
        : null;
  const offerEvent = earliestEvent(eventsOf("OFFER_RECEIVED"));
  const closeEvent = latestEvent(
    eventsOf(
      ...(rejected ? ["REJECTION_RECEIVED", "ROUND_FAILED"] : ["CLOSED_NO_REPLY", "WITHDRAWN"]),
    ),
  );
  let final: NamedStep;
  if (settled)
    final = {
      key: "final",
      label: settled,
      detail: join(settled, day(offer.at)),
      state: "done",
      tone: settled === "Accepted" ? "offer" : "muted",
      target: targetOf(offerEvent),
    };
  else if (closed) {
    const withdrew = record.closedReason === "WITHDREW" || record.status === "WITHDRAWN";
    final = {
      key: "final",
      label: rejected ? "Rejected" : withdrew ? "Withdrew" : "Closed",
      detail: day(stopped?.at ?? closeEvent?.occurredAt ?? null),
      state: "stopped",
      tone: rejected ? "bad" : "muted",
      target: targetOf(closeEvent),
    };
  } else if (reached(offer))
    final = {
      key: "final",
      label: "Offer",
      detail: day(offer.at),
      state: "done",
      tone: "offer",
      target: targetOf(offerEvent),
    };
  else
    final = {
      key: "final",
      label: "Offer / Rejected",
      detail: "",
      state: "ahead",
      tone: "offer",
      target: null,
    };

  // Rounds after a failed one were never reached; the outcome step is the end of the line.
  const stopIndex = steps.findIndex((step) => step.state === "stopped");
  if (stopIndex !== -1) for (const step of steps.slice(stopIndex + 1)) step.state = "faded";
  // A close (rejection, withdrawal, no reply) leaves unfinished rounds unsettled; they were not reached.
  if (closed)
    for (const step of steps)
      if (step.key.startsWith("round-") && step.state === "current") {
        step.state = "faded";
        delete step.due;
      }
  steps.push(final);

  if (!closed && !steps.some((step) => step.state === "current")) {
    const lastDone = steps.findLastIndex((step) => step.state === "done");
    steps[Math.max(lastDone, 0)].state = "current";
  }
  return steps;
}

/** The step the application is at now: the current one, else where it stopped, else the last reached. */
export function currentNamedStep(steps: NamedStep[]): NamedStep {
  return (
    steps.find((step) => step.state === "current") ??
    steps.find((step) => step.key === "final" && step.state === "stopped") ??
    steps.find((step) => step.state === "stopped") ??
    steps.findLast((step) => step.state === "done") ??
    steps[0]
  );
}
