import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../ui/utils";
import { PriorityBadge } from "./PriorityBadge";
import { FitScoreCell } from "./FitScoreCell";
import { StatusCell } from "./StatusCell";
import { JobTableExpandedRow } from "./JobTableExpandedRow";
import type { ApplicationStatus } from "../../lib/constants";
import type { components } from "../../lib/api-types";

export type ScoredJobRow = components["schemas"]["ScoredJobOut"];

export function JobTableRow({
  scored,
  expanded,
  onToggle,
}: {
  scored: ScoredJobRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const status = (scored.application?.status ?? "Found") as ApplicationStatus;

  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-t border-border transition-colors hover:bg-surface-hover",
          expanded && "bg-surface-strong",
        )}
      >
        <td className="px-5 py-4" onClick={onToggle}>
          <div className="flex items-center gap-2 font-medium text-text">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/20">
              <Chevron className="h-3.5 w-3.5 text-text-faint" />
            </span>
            <span>
              <span className="block leading-tight">{scored.job.company}</span>
              <span className="mt-1 block text-[11px] font-normal text-text-faint">
                {scored.job.remote_type || scored.level_match || "Lead"}
              </span>
            </span>
          </div>
        </td>
        <td className="px-4 py-4 text-text-muted" onClick={onToggle}>
          {scored.job.role}
        </td>
        <td className="px-4 py-4" onClick={onToggle}>
          <FitScoreCell score={scored.fit_score} />
        </td>
        <td className="px-4 py-4" onClick={onToggle}>
          <PriorityBadge priority={scored.priority} />
        </td>
        <td className="px-4 py-4 text-xs text-text-muted" onClick={onToggle}>
          {scored.job.location || "—"}
        </td>
        <td className="px-4 py-4 text-xs text-text-muted" onClick={onToggle}>
          {scored.job.source}
        </td>
        <td className="px-5 py-4">
          <StatusCell
            jobId={scored.job.id}
            value={status}
            nextInterviewAt={scored.application?.next_interview_at ?? null}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border">
          <td colSpan={7} className="p-0">
            <JobTableExpandedRow scored={scored} />
          </td>
        </tr>
      )}
    </>
  );
}
