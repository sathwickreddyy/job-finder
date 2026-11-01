import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDay } from "../dates";
import type { Journey, JourneyStep } from "../journey";

/** The mail tag stage colours: blue applied, amber interviewing, teal offer, red rejected. */
const fill: Record<JourneyStep["tone"], string> = {
  applied: "bg-tag-application",
  interviewing: "bg-tag-interview-call",
  offer: "bg-tag-offer",
  bad: "bg-tag-rejection",
  muted: "bg-muted-foreground",
};
const columns = { 3: "grid-cols-3", 4: "grid-cols-4" } as const;
const said: Record<JourneyStep["state"], string> = {
  reached: "reached",
  stopped: "ended here",
  ahead: "not yet",
  faded: "not reached",
};

/**
 * Sent to Offer (or Sent, Replied, Referred), filled up to how far it got with the India date
 * under each step. A stop takes the place of the next step and later steps fade.
 */
export function JourneyTrack({
  journey,
  size = "row",
  className,
}: {
  journey: Journey;
  size?: "row" | "large" | "mobile";
  className?: string;
}) {
  const large = size === "large";
  const mobile = size === "mobile";
  const current = journey.steps.findLastIndex(
    (step) => step.state === "reached" || step.state === "stopped",
  );
  const outline: Record<JourneyStep["tone"], string> = {
    applied: "outline-tag-application",
    interviewing: "outline-tag-interview-call",
    offer: "outline-tag-offer",
    bad: "outline-tag-rejection",
    muted: "outline-muted-foreground",
  };
  return (
    <ol
      aria-label="Progress"
      className={cn(
        "m-0 grid list-none p-0",
        columns[journey.steps.length as 3 | 4] ?? "grid-cols-4",
        className,
      )}
    >
      {journey.steps.map((step, index) => {
        const filled = step.state === "reached" || step.state === "stopped";
        return (
          <li
            key={index}
            className={cn("relative min-w-0", step.state === "faded" && "opacity-35")}
          >
            {index > 0 && (
              // Runs from the previous circle's edge to this one's with a 4px gap, so it never
              // paints over either circle (half of a 24px or 28px circle, plus the gap).
              <span
                aria-hidden
                className={cn(
                  "absolute h-0.5 rounded-full",
                  large
                    ? "top-[13px] right-[calc(50%+18px)] left-[calc(-50%+18px)]"
                    : "top-[11px] right-[calc(50%+16px)] left-[calc(-50%+16px)]",
                  filled ? fill[step.tone] : "bg-border",
                )}
              />
            )}
            <div className="relative flex flex-col items-center gap-1 text-center">
              <span
                aria-hidden
                className={cn(
                  "grid place-items-center rounded-full",
                  large ? "size-7" : "size-6",
                  filled
                    ? cn(fill[step.tone], "text-background")
                    : "bg-card ring-2 ring-border ring-inset",
                  mobile &&
                    current === index &&
                    step.state === "reached" &&
                    cn("outline-2 outline-offset-[3px]", outline[step.tone]),
                )}
              >
                {step.state === "stopped" ? (
                  <X size={large ? 15 : 14} strokeWidth={3} />
                ) : mobile && current === index && step.state === "reached" ? (
                  <span className="size-2 rounded-full bg-current" />
                ) : step.state === "reached" ? (
                  <Check size={large ? 15 : 14} strokeWidth={3} />
                ) : null}
              </span>
              <span
                className={cn(
                  "max-w-full truncate leading-tight",
                  // Four columns on a phone leave about 76px: "Acknowledged" fits only tightened.
                  mobile
                    ? "mt-1.5 text-[10px] tracking-tight"
                    : large
                      ? "text-xs"
                      : "text-[10.5px] tracking-tight sm:text-[11px] sm:tracking-normal",
                  step.state === "stopped" && step.tone === "bad"
                    ? "font-medium text-destructive"
                    : step.state === "stopped"
                      ? "font-medium text-muted-foreground"
                      : step.state === "reached"
                        ? "font-medium"
                        : "text-muted-foreground",
                )}
              >
                {mobile && step.label === "Acknowledged"
                  ? "Received"
                  : mobile && step.label === "Interviewing"
                    ? "Interview"
                    : step.label}
                {mobile && step.label === "Acknowledged" && (
                  <span className="sr-only"> (acknowledged)</span>
                )}
                <span className="sr-only">, {said[step.state]}</span>
              </span>
              <span
                className={cn(
                  "leading-tight text-muted-foreground tabular-nums",
                  large ? "h-4 text-xs" : "h-3.5 text-[11px]",
                )}
              >
                {step.at ? formatDay(step.at) : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
