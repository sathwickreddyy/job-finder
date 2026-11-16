import type { RoundKind } from "@/lib/round-kinds";
import { formatDay, formatDayTime } from "./dates";
import { journeyOf, type JourneySource, type JourneyStep } from "./journey";
import { isTechnicalRound, roundLabel, roundLabels } from "./round-label";
import type { ApplicationRecord } from "./read";

export type NamedStep = {
  key: string;
  label: string;
  detail: string;
  state: "done" | "current" | "expected" | "ahead" | "stopped" | "faded";
  tone: "applied" | "interviewing" | "offer" | "bad" | "muted";
  due?: boolean;
};
export type NamedStepSource = JourneySource & Pick<ApplicationRecord, "typicalLoop">;

export const EXPECTED_DETAIL = "Expected · from company research";

const day = (value: Date | null) => (value ? formatDay(value) : "");
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

function roundDetail(round: JourneySource["rounds"][number], now: Date) {
  const at = round.scheduledAt;
  if (round.outcome === "PASSED") return { detail: join("Cleared", day(at)) };
  if (round.outcome === "FAILED") return { detail: join("Not cleared", day(at)) };
  if (!at) return { detail: "Not booked" };
  if (at.getTime() > now.getTime()) return { detail: `Booked ${formatDayTime(at)}` };
  return { detail: join("Result due", day(at)), due: true as const };
}

/**
 * Where an application stands as named steps (spec, Named steps): Applied, Acknowledged, one
 * step per recorded round, the rounds company research still expects, then Offer. Evidence and
 * close semantics come from `journeyOf`; expected rounds are never counted as reached.
 */
export function namedStepsOf(record: NamedStepSource, now: Date): NamedStep[] {
  const journey = journeyOf(record);
  if (journey.kind === "outreach")
    return journey.steps.map((step, index) => ({
      key: `step-${index}`,
      label: step.label,
      detail: day(step.at),
      state: step.state === "reached" ? "done" : step.state,
      tone: step.tone,
    }));

  const [sent, acknowledged, interviewing, offer] = journey.steps;
  const reached = (step: JourneyStep) => step.state === "reached";
  const stopped = journey.steps.find((step) => step.state === "stopped");
  const closed = record.phase === "Closed";

  const steps: NamedStep[] = [
    {
      key: "applied",
      label: sent.label === "Not sent" ? "Not sent" : "Applied",
      detail: day(sent.at),
      state: reached(sent) ? "done" : "ahead",
      tone: "applied",
    },
    {
      key: "acknowledged",
      label: "Acknowledged",
      detail: day(acknowledged.at),
      state: reached(acknowledged) || reached(interviewing) || reached(offer) ? "done" : "ahead",
      tone: "applied",
    },
  ];

  const rounds = record.rounds
    .filter((round) => round.outcome !== "CANCELLED")
    .sort((a, b) => a.position - b.position);
  const labels = roundLabels(rounds);
  rounds.forEach((round, index) => {
    const label = labels[index];
    const { detail, due } = roundDetail(round, now);
    const name = round.name.trim();
    steps.push({
      key: round.id,
      label,
      detail: name && !label.endsWith(name) ? join(detail, name) : detail,
      state: round.outcome === "PASSED" ? "done" : round.outcome === "FAILED" ? "ahead" : "current",
      tone: "interviewing",
      ...(due ? { due } : {}),
    });
  });
  if (!rounds.length && reached(interviewing))
    steps.push({
      key: "interviewing",
      label: "Interviewing",
      detail: day(interviewing.at),
      state: "done",
      tone: "interviewing",
    });

  if (rounds.length && !closed) {
    let technical = rounds.filter((round) => isTechnicalRound(round.kind)).length;
    record.typicalLoop.slice(rounds.length).forEach((kind: RoundKind, index) => {
      steps.push({
        key: `expected-${index}`,
        label: roundLabel(kind, isTechnicalRound(kind) ? ++technical : 0),
        detail: EXPECTED_DETAIL,
        state: "expected",
        tone: "interviewing",
      });
    });
  }

  steps.push({
    key: "offer",
    label: "Offer",
    detail: day(offer.at),
    state: reached(offer) ? "done" : "ahead",
    tone: "offer",
  });

  if (stopped) {
    const bad = stopped.tone === "bad";
    const stop: NamedStep = {
      key: "closed",
      label: stopped.label,
      detail: day(stopped.at),
      state: "stopped",
      tone: bad ? "bad" : "muted",
    };
    const at = steps.findIndex((step) => step.state !== "done");
    const offerIndex = steps.length - 1;
    if (at === -1 || at === offerIndex) steps.splice(offerIndex, 0, stop);
    else steps[at] = { ...stop, key: steps[at].key };
    const stopIndex = steps.findIndex((step) => step.state === "stopped");
    for (const step of steps.slice(stopIndex + 1)) step.state = "faded";
    return steps;
  }

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
    steps.find((step) => step.state === "stopped") ??
    steps.findLast((step) => step.state === "done") ??
    steps[0]
  );
}
