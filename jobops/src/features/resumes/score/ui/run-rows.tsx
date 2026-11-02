"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { fmt } from "../../fit/bits";
import { TOOL_META, TOOL_SOURCES, type ToolSource } from "../../fit/tools";

export type RunStatus =
  | { state: "waiting" | "running" }
  | {
      state: "done";
      score: number | null;
      baseScore: number | null;
      baseSkipped?: "no_text" | "no_base" | "failed";
      baseError?: string;
    }
  | { state: "error"; message: string; code?: string };

const WHERE: Record<ToolSource, string> = {
  "jobops-lexical": "JobOps scoring service, on this computer",
  resumenext: "Sends the text to resumenext.io",
  "resume-ats-optimizer": "JobOps scoring service, on this computer",
};

const day = (value: Date) =>
  value.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function Status({ status }: { status: RunStatus }) {
  if (status.state === "done")
    return <Check size={16} className="text-success" aria-label="Done" />;
  if (status.state === "error")
    return <CircleAlert size={16} className="text-danger-action" aria-label="Failed" />;
  if (status.state === "running")
    return (
      <LoaderCircle
        size={16}
        className="animate-spin text-link motion-reduce:animate-none"
        aria-label="Checking"
      />
    );
  return <span className="size-2 rounded-full bg-muted-foreground/50" aria-label="Waiting" />;
}

/** One row per tool while the checks run, each with this file's score and the current résumé's. */
export function RunRows({
  opening,
  statuses,
  reviewedAt,
  onRetry,
  onEditTerms,
  onDone,
}: {
  opening: { company: string; title: string };
  statuses: Record<ToolSource, RunStatus>;
  reviewedAt: Date;
  onRetry: (tool: ToolSource) => void;
  onEditTerms: () => void;
  onDone: () => void;
}) {
  const finished = TOOL_SOURCES.every((s) => ["done", "error"].includes(statuses[s].state));
  return (
    <section
      aria-label="Checks for this job"
      aria-live="polite"
      className="rounded-3xl bg-card p-4"
    >
      <p className="m-0 truncate text-xs text-muted-foreground">
        Against {opening.company} · {opening.title}
      </p>
      <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
        Using your terms from {day(reviewedAt)} ·{" "}
        <button type="button" onClick={onEditTerms} className="font-medium text-link">
          Edit terms
        </button>
      </p>
      <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
        {TOOL_SOURCES.map((tool) => {
          const status = statuses[tool];
          return (
            <li key={tool} className="flex items-start gap-3 rounded-2xl bg-background px-3 py-2.5">
              <span className="grid size-6 shrink-0 place-items-center">
                <Status status={status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{TOOL_META[tool].name}</span>
                <span className="block text-[11px] text-muted-foreground">{WHERE[tool]}</span>
                {status.state === "error" && (
                  <span className="mt-1 block text-[11px] text-danger-action">
                    {status.message}{" "}
                    <button
                      type="button"
                      onClick={() => onRetry(tool)}
                      className="font-medium text-link"
                    >
                      Try again
                    </button>
                  </span>
                )}
                {status.state === "done" &&
                  (status.baseSkipped === "no_text" || status.baseSkipped === "failed") && (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {status.baseError
                        ? `The current résumé couldn't be scored: ${status.baseError}`
                        : "The current résumé couldn't be scored"}
                    </span>
                  )}
              </span>
              {status.state === "done" && (
                <span className="text-right tabular-nums">
                  {status.score === null ? (
                    <span className="block text-xs text-warning">Needs a manual look</span>
                  ) : (
                    <span className="block text-sm font-semibold">{fmt(status.score)}</span>
                  )}
                  {status.baseScore !== null && (
                    <span className="block text-[11px] text-muted-foreground">
                      current {fmt(status.baseScore)}
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-3 text-[11px] text-muted-foreground">
        Each check scores this file and the current résumé, so the comparison uses the same terms.
      </p>
      {finished && (
        <button
          type="button"
          onClick={onDone}
          className="mt-3 w-full rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Done
        </button>
      )}
    </section>
  );
}
