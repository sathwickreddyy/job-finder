import type { TimelineDay } from "./entries";
import type { RoundCardData } from "./round-card";

export type TimelineFilter = "all" | "stages" | "mail";
/** Stages shows steps and round cards, Mail shows emails; a round without card data is hidden. */
export function isShown(
  entry: TimelineDay["entries"][number],
  filter: TimelineFilter,
  hasCard: boolean,
) {
  if (entry.type === "round") return hasCard && filter !== "mail";
  return filter === "all" || (filter === "mail") === (entry.type === "mail");
}

const domIdOf = (entry: TimelineDay["entries"][number]) =>
  entry.type === "mail"
    ? `mail-${entry.item.id}`
    : entry.type === "round"
      ? `round-${entry.round.id}`
      : `entry-${entry.id}`;

/**
 * The row a `#entry-…`, `#mail-…` or `#round-…` link names in this timeline, and whether the
 * current filter hides it (so the filter must go back to All). Null when the hash names nothing here.
 */
export function jumpTarget(
  hash: string,
  days: TimelineDay[],
  filter: TimelineFilter,
  roundCards: Record<string, RoundCardData>,
): { id: string; resetFilter: boolean } | null {
  const id = hash.replace(/^#/, "");
  if (!/^(entry|mail|round)-/.test(id)) return null;
  for (const day of days)
    for (const entry of day.entries)
      if (domIdOf(entry) === id)
        return {
          id,
          resetFilter: !isShown(
            entry,
            filter,
            !!roundCards[entry.type === "round" ? entry.round.id : ""],
          ),
        };
  return null;
}
