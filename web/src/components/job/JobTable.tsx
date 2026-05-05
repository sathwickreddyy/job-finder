import { useState } from "react";
import { JobTableRow } from "./JobTableRow";
import { EmptyState } from "../shared/EmptyState";

type Row = Parameters<typeof JobTableRow>[0]["scored"];
type App = Parameters<typeof JobTableRow>[0]["application"];

export function JobTable({
  rows,
  applicationsByJobId = {},
}: {
  rows: Row[];
  applicationsByJobId?: Record<string, App>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return <EmptyState title="No jobs match your filters." hint="Try widening the search." />;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-text-muted">
            <th className="text-left px-4 py-3 font-medium">Company</th>
            <th className="text-left px-4 py-3 font-medium">Role</th>
            <th className="text-left px-4 py-3 font-medium">Fit</th>
            <th className="text-left px-4 py-3 font-medium">Pri</th>
            <th className="text-left px-4 py-3 font-medium">Location</th>
            <th className="text-left px-4 py-3 font-medium">Source</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((scored) => (
            <JobTableRow
              key={scored.job.id}
              scored={scored}
              application={applicationsByJobId[scored.job.id] || null}
              expanded={expanded.has(scored.job.id)}
              onToggle={() => toggle(scored.job.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
