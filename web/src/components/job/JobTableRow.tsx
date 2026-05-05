import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../ui/utils";
import { PriorityBadge } from "./PriorityBadge";
import { FitScoreCell } from "./FitScoreCell";
import { StatusCell } from "./StatusCell";
import { JobTableExpandedRow } from "./JobTableExpandedRow";
import type { ApplicationStatus } from "../../lib/constants";

type ScoredJobRow = {
  job: {
    id: string;
    role: string;
    company: string;
    url: string;
    location: string | null;
    source: string;
    description: string | null;
  };
  fit_score: number;
  priority: "P0" | "P1" | "P2" | "Ignore";
  matched_skills: string[];
  missing_skills: string[];
  reasons: string[];
  recommended_resume_variant: string | null;
};

export function JobTableRow({
  scored,
  application,
  expanded,
  onToggle,
}: {
  scored: ScoredJobRow;
  application: { status: ApplicationStatus; next_interview_at: string | null } | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const status = (application?.status ?? "Found") as ApplicationStatus;

  return (
    <>
      <tr
        className={cn(
          "border-t border-border cursor-pointer hover:bg-surface-hover",
          expanded && "bg-surface",
        )}
      >
        <td className="px-4 py-3" onClick={onToggle}>
          <div className="flex items-center gap-2 font-medium text-text">
            <Chevron className="w-3 h-3 text-text-faint" />
            {scored.job.company}
          </div>
        </td>
        <td className="px-4 py-3 text-text-muted" onClick={onToggle}>
          {scored.job.role}
        </td>
        <td className="px-4 py-3" onClick={onToggle}>
          <FitScoreCell score={scored.fit_score} />
        </td>
        <td className="px-4 py-3" onClick={onToggle}>
          <PriorityBadge priority={scored.priority} />
        </td>
        <td className="px-4 py-3 text-xs text-text-muted" onClick={onToggle}>
          {scored.job.location || "—"}
        </td>
        <td className="px-4 py-3 text-xs text-text-muted" onClick={onToggle}>
          {scored.job.source}
        </td>
        <td className="px-4 py-3">
          <StatusCell
            jobId={scored.job.id}
            value={status}
            nextInterviewAt={application?.next_interview_at ?? null}
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
