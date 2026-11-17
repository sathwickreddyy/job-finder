import type { NamedStep } from "@/features/applications/named-steps";
import { cn } from "@/lib/utils";

const fills = {
  done: "bg-primary",
  current: "bg-review ring-2 ring-review/30",
  stopped: "bg-destructive",
  ahead: "bg-muted",
  faded: "bg-muted",
} satisfies Record<NamedStep["state"], string>;

/** One segment per step: done in the primary colour, the current step ringed, a stop in red. */
export function StepProgress({ steps }: { steps: NamedStep[] }) {
  const reached = steps.filter((step) => step.state === "done" || step.state === "current").length;
  return (
    <span
      role="img"
      aria-label={`${reached} of ${steps.length} steps`}
      className="flex w-24 shrink-0 items-center gap-1"
    >
      {steps.map((step) => (
        <i
          key={step.key}
          data-state={step.state}
          className={cn("h-1.5 min-w-0 flex-1 rounded-full", fills[step.state])}
        />
      ))}
    </span>
  );
}
