import { useState } from "react";
import { JobTableRow, type ScoredJobRow } from "./JobTableRow";
import { EmptyState } from "../shared/EmptyState";

export function JobTable({ rows }: { rows: ScoredJobRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No jobs match your filters."
        hint="Try widening the search, clearing a status filter, or running a fresh search."
      />
    );
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-xl shadow-black/5 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-text">Job pipeline</div>
          <div className="text-xs text-text-muted">
            {rows.length} visible lead{rows.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-full border border-border bg-black/15 px-3 py-1 text-[11px] text-text-muted">
          Click a row for fit notes and resume tailoring
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="bg-black/10 text-[10px] uppercase tracking-[0.22em] text-text-muted">
              <th className="px-5 py-3 text-left font-semibold">Company</th>
              <th className="px-4 py-3 text-left font-semibold">Role</th>
              <th className="px-4 py-3 text-left font-semibold">Fit</th>
              <th className="px-4 py-3 text-left font-semibold">Pri</th>
              <th className="px-4 py-3 text-left font-semibold">Location</th>
              <th className="px-4 py-3 text-left font-semibold">Source</th>
              <th className="px-5 py-3 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((scored) => (
              <JobTableRow
                key={scored.job.id}
                scored={scored}
                expanded={expanded.has(scored.job.id)}
                onToggle={() => toggle(scored.job.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
