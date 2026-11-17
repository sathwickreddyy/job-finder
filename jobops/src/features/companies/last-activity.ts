import type { TimelineDay, TimelineEntry } from "@/features/timeline/entries";

export type LastActivity = { at: string; kind: "Recorded" | "Round" | "Email" } | null;

const kindOf: Record<TimelineEntry["type"], NonNullable<LastActivity>["kind"]> = {
  step: "Recorded",
  round: "Round",
  mail: "Email",
};

/** The newest entry that has already happened; a round booked for later is not activity yet. */
export function lastActivityOf(days: TimelineDay[][], now: Date): LastActivity {
  const limit = now.toISOString();
  let best: TimelineEntry | null = null;
  for (const entry of days.flat().flatMap((day) => day.entries))
    if (entry.at <= limit && (!best || entry.at > best.at)) best = entry;
  return best ? { at: best.at, kind: kindOf[best.type] } : null;
}
