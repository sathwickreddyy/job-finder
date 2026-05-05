import { Badge } from "../ui/Badge";
import type { Priority } from "../../lib/constants";

const TONE = { P0: "cyan", P1: "amber", P2: "grey", Ignore: "red" } as const;
// Shape cue in addition to color so priority remains distinguishable in
// greyscale and for color-blind users. "●" filled = hot, "◐" half = warm,
// "○" hollow = cool, "✕" = ignore.
const GLYPH = { P0: "●", P1: "◐", P2: "○", Ignore: "✕" } as const;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge tone={TONE[priority]}>
      <span aria-hidden="true" className="mr-1">
        {GLYPH[priority]}
      </span>
      {priority}
    </Badge>
  );
}
