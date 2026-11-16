import { roundKindLabel } from "@/features/companies/metrics";
import type { RoundKind } from "@/lib/round-kinds";

const peopleLabels: Partial<Record<RoundKind, string>> = {
  HIRING_MANAGER: "Managerial round",
  HR: "HR round",
  BEHAVIORAL: "Behavioural round",
};

/** People rounds keep their name; technical rounds are numbered among themselves. */
export function isTechnicalRound(kind: RoundKind): boolean {
  return !(kind in peopleLabels);
}

/** "Round 2 · LLD", "Managerial round", "HR round" or "Behavioural round". */
export function roundLabel(kind: RoundKind, technicalIndex: number): string {
  return peopleLabels[kind] ?? `Round ${technicalIndex} · ${roundKindLabel[kind]}`;
}

/**
 * Labels for an application's rounds in position order. Only technical rounds are numbered, and
 * cancelled rounds take no number, so the labels match the named steps.
 */
export function roundLabels(rounds: { kind: RoundKind; outcome: string }[]): string[] {
  let technical = 0;
  return rounds.map(({ kind, outcome }) => {
    if (outcome === "CANCELLED")
      return `${roundLabel(kind, 0).replace(/^Round 0 · /, "")} (cancelled)`;
    return roundLabel(kind, isTechnicalRound(kind) ? ++technical : 0);
  });
}
