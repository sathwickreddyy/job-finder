import { Badge } from "../ui/Badge";
import type { Priority } from "../../lib/constants";

const TONE = { P0: "cyan", P1: "amber", P2: "grey", Ignore: "red" } as const;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={TONE[priority]}>{priority}</Badge>;
}
