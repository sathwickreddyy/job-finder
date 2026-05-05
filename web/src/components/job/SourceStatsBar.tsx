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
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-xl shadow-black/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text">Source health</div>
          <div className="text-xs text-text-muted">Fetched, filtered, and timing per provider.</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {entries.map(([source, s]) => (
          <span
            key={source}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
              s.error
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-border bg-black/15 text-text-muted",
            )}
            title={s.error || `${s.kept}/${s.fetched} kept in ${s.duration_ms}ms`}
          >
            {s.error ? <TriangleAlert className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-success" />}
            <strong className="text-text">{source}</strong>
            <span>
              {s.kept}/{s.fetched}
            </span>
            <span className="text-text-faint">({(s.duration_ms / 1000).toFixed(1)}s)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
