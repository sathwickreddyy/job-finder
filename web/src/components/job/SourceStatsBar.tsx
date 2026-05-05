import { Check, TriangleAlert } from "lucide-react";
import { cn } from "../ui/utils";

export function SourceStatsBar({
  stats,
}: {
  stats: Record<string, { fetched: number; kept: number; duration_ms: number; error?: string | null }>;
}) {
  const entries = Object.entries(stats);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {entries.map(([source, s]) => (
        <span
          key={source}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded border",
            s.error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border bg-surface text-text-muted",
          )}
          title={s.error || `${s.kept}/${s.fetched} kept in ${s.duration_ms}ms`}
        >
          {s.error ? <TriangleAlert className="w-3 h-3" /> : <Check className="w-3 h-3 text-success" />}
          <strong className="text-text">{source}</strong>
          <span>
            {s.kept}/{s.fetched}
          </span>
          <span className="text-text-faint">({(s.duration_ms / 1000).toFixed(1)}s)</span>
        </span>
      ))}
    </div>
  );
}
