"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { useEdgeFade } from "@/lib/use-edge-fade";
import { cn } from "@/lib/utils";
import type { NamedStep } from "../named-steps";

const said: Record<NamedStep["state"], string> = {
  done: "reached",
  current: "current step",
  ahead: "not yet",
  stopped: "ended here",
  faded: "not reached",
};

function Dot({ step, small }: { step: NamedStep; small: boolean }) {
  const size = small ? "size-5" : "size-6";
  if (step.state === "done")
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground",
          size,
        )}
      >
        <Check aria-hidden size={small ? 12 : 14} strokeWidth={3} />
      </span>
    );
  if (step.state === "current")
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full ring-2 ring-inset",
          size,
          step.due ? "ring-warning" : "ring-primary",
        )}
      >
        <span className={cn("size-2.5 rounded-full", step.due ? "bg-warning" : "bg-primary")} />
      </span>
    );
  if (step.state === "stopped")
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full text-white",
          size,
          step.tone === "bad" ? "bg-destructive" : "bg-muted-foreground",
        )}
      >
        <X aria-hidden size={small ? 12 : 14} strokeWidth={3} />
      </span>
    );
  return (
    <span
      className={cn(
        "block shrink-0 rounded-full border-2 border-border",
        size,
        step.state === "faded" && "opacity-50",
      )}
    />
  );
}

/**
 * Where an application stands as named steps (gallery stage A). Scrolls sideways when narrow,
 * fades only the hidden edge and centres the current step by scrolling only itself.
 */
export function NamedSteps({
  steps,
  size,
  className,
  add,
}: {
  steps: NamedStep[];
  size: "row" | "page";
  className?: string;
  /** A control shown as a step just before the final outcome step. */
  add?: ReactNode;
}) {
  const compact = size === "row";
  const { ref, style, update } = useEdgeFade<HTMLOListElement>("x");
  const signature = steps.map((step) => `${step.key}:${step.state}`).join("|");
  useEffect(() => {
    const list = ref.current;
    const current =
      list?.querySelector<HTMLElement>("[aria-current='step']") ??
      list?.querySelector<HTMLElement>("[data-state='stopped']");
    if (!list || !current) return;
    list.scrollLeft = current.offsetLeft - list.clientWidth / 2 + current.clientWidth / 2;
    update();
  }, [ref, update, signature]);
  return (
    <ol
      ref={ref}
      style={style}
      aria-label="Where this application stands"
      className={cn(
        "relative m-0 flex min-w-0 list-none overflow-x-auto p-0 pb-1 [scrollbar-width:none]",
        className,
      )}
    >
      {steps.map((step, index) => {
        const reached = step.state === "done" || step.state === "current";
        const title = step.detail ? `${step.label} · ${step.detail}` : step.label;
        const width = compact ? "w-[84px]" : "w-[112px]";
        const body = (
          <>
            <span className="relative z-10 rounded-full bg-card px-1">
              <Dot step={step} small={compact} />
            </span>
            <span
              className={cn(
                "mt-1.5 line-clamp-2 px-1 text-xs leading-tight",
                step.state === "current" || step.state === "stopped"
                  ? "font-semibold text-foreground"
                  : step.state === "done"
                    ? "text-foreground"
                    : "text-muted-foreground",
                step.state === "stopped" && step.tone === "bad" && "text-destructive",
              )}
            >
              {step.label}
              <span className="sr-only">, {said[step.state]}</span>
            </span>
            {!compact && step.detail && (
              <span
                className={cn(
                  "mt-0.5 line-clamp-2 px-1 text-[11px] leading-tight text-muted-foreground",
                  step.due && "font-medium text-warning",
                )}
              >
                {step.detail}
              </span>
            )}
          </>
        );
        const inner = "flex w-full flex-col items-center text-center";
        return (
          <Fragment key={step.key}>
            {add && step.key === "final" && (
              <li
                data-add
                className={cn("relative flex shrink-0 flex-col items-center text-center", width)}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-1/2 w-full border-t-2 border-dashed border-border",
                    compact ? "top-[9px]" : "top-[11px]",
                  )}
                />
                <span className="relative z-10 rounded-full bg-card px-1">{add}</span>
              </li>
            )}
            <li
              data-state={step.state}
              aria-current={step.state === "current" ? "step" : undefined}
              title={title}
              className={cn(
                "relative flex shrink-0 flex-col items-center text-center",
                width,
                step.state === "faded" && "opacity-60",
              )}
            >
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-1/2 w-full border-t-2",
                    compact ? "top-[9px]" : "top-[11px]",
                    reached ? "border-primary" : "border-dashed border-border",
                  )}
                />
              )}
              {(reached || step.state === "stopped") && step.target ? (
                <a href={`#${step.target}`} className={cn(inner, "no-underline")}>
                  {body}
                </a>
              ) : (
                <div className={inner}>{body}</div>
              )}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
