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
  size?: "row" | "large";
  className?: string;
}) {
  const large = size === "large";
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
              <span
                aria-hidden
                className={cn(
                  "absolute right-1/2 left-[-50%] h-0.5 rounded-full",
                  large ? "top-[13px]" : "top-[11px]",
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
                )}
              >
                {step.state === "stopped" ? (
                  <X size={large ? 15 : 14} strokeWidth={3} />
                ) : step.state === "reached" ? (
                  <Check size={large ? 15 : 14} strokeWidth={3} />
                ) : null}
              </span>
              <span
                className={cn(
                  "max-w-full truncate leading-tight",
                  large ? "text-xs" : "text-[11px]",
                  step.state === "stopped" && step.tone === "bad"
                    ? "font-medium text-destructive"
                    : step.state === "stopped"
                      ? "font-medium text-muted-foreground"
                      : step.state === "reached"
                        ? "font-medium"
                        : "text-muted-foreground",
                )}
              >
                {step.label}
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
