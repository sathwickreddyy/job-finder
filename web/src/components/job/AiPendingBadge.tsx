import { Sparkles } from "lucide-react";
import { Badge } from "../ui/Badge";

export function AiPendingBadge({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <Badge tone="amber" className="gap-1">
      <Sparkles className="w-3 h-3" />
      AI integration pending
    </Badge>
  );
}
