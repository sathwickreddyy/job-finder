"use client";

import { Gauge } from "lucide-react";

/** The outlined pill under the job bar that starts scoring this file against a saved opening. */
export function ScoreButton({
  tailored,
  disabledReason,
  expanded,
  onClick,
}: {
  tailored: boolean;
  disabledReason?: string;
  expanded?: boolean;
  onClick?: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={Boolean(disabledReason)}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-describedby={disabledReason ? "score-disabled-reason" : undefined}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-link hover:bg-muted disabled:hover:bg-transparent"
      >
        <Gauge size={16} aria-hidden />
        {tailored ? "Score against another job" : "Score against a job"}
      </button>
      {disabledReason && (
        <p id="score-disabled-reason" className="m-0 mt-1.5 px-1 text-xs text-muted-foreground">
          {disabledReason}
        </p>
      )}
    </div>
  );
}
