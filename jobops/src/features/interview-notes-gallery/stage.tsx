"use client";

import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CompanyMark,
  Expand,
  ExpandButton,
  currentStep,
  nextStep,
  useEdgeFade,
  type Step,
} from "./shared";
import type { GalleryApplication, Variant } from "./types";

function Dot({ step, small = false }: { step: Step; small?: boolean }) {
  const size = small ? "size-5" : "size-6";
  if (step.state === "done")
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground", size)}>
        <Check aria-hidden size={small ? 12 : 14} strokeWidth={3} />
      </span>
    );
  if (step.state === "current")
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full ring-2",
          size,
          step.due ? "ring-warning" : "ring-primary",
        )}
      >
        <span className={cn("size-2.5 rounded-full", step.due ? "bg-warning" : "bg-primary")} />
      </span>
    );
  return (
    <span
      className={cn(
        "block shrink-0 rounded-full border-2",
        size,
        step.state === "expected" ? "border-dashed border-border" : "border-border",
      )}
    />
  );
}

/* A. Named stepper: every step labelled; scrolls sideways, current step kept in view. */
function Stepper({ app, compact }: { app: GalleryApplication; compact: boolean }) {
  const { steps } = currentStep(app);
  const { ref, style, update } = useEdgeFade<HTMLOListElement>("x");
  // Once per application: centre the current step by scrolling only the stepper, never the page.
  useEffect(() => {
    const list = ref.current;
    const current = list?.querySelector<HTMLElement>("[aria-current='step']");
    if (!list || !current) return;
    list.scrollLeft = current.offsetLeft - list.clientWidth / 2 + current.clientWidth / 2;
    update();
  }, [ref, update, app.id]);
  return (
    <ol
      ref={ref}
      style={style}
      className="relative m-0 flex min-w-0 list-none overflow-x-auto p-0 pb-1 [scrollbar-width:none]"
      aria-label="Where this application stands"
    >
      {steps.map((step, index) => (
        <li
          key={step.key}
          aria-current={step.state === "current" ? "step" : undefined}
          className={cn("relative flex shrink-0 flex-col items-center text-center", compact ? "w-[88px]" : "w-[112px]")}
        >
          {index > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute top-[11px] right-1/2 w-full border-t-2",
                compact && "top-[9px]",
                step.state === "done" || step.state === "current" ? "border-primary" : "border-dashed border-border",
              )}
            />
          )}
          <span className="relative z-10 bg-card px-1">
            <Dot step={step} small={compact} />
          </span>
          <span
            className={cn(
              "mt-1.5 line-clamp-2 px-1 text-xs leading-tight",
              step.state === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
              step.state === "done" && "text-foreground",
            )}
          >
            {step.label}
          </span>
          {!compact && step.detail && (
            <span
              className={cn(
                "mt-0.5 text-[11px] text-muted-foreground",
                step.due && "font-medium text-warning",
              )}
            >
              {step.detail}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/* B. Headline and segmented bar: one line says where you are; the bar shows how far. */
function Segments({ app, compact }: { app: GalleryApplication; compact: boolean }) {
  const { steps, current, rounds, roundIndex } = currentStep(app);
  const headline =
    roundIndex >= 0 ? `${current.label}` : current.key === "ack" ? "Acknowledged" : current.label;
  return (
    <div className="min-w-0 @container">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className={cn("m-0 truncate font-semibold", compact ? "text-sm" : "text-base")}>{headline}</p>
        <p className={cn("m-0 text-xs text-muted-foreground", current.due && "font-medium text-warning")}>
          {roundIndex >= 0
            ? `${roundIndex + 1} of ${rounds.length} rounds · ${current.detail}`
            : current.key === "ack"
              ? `${current.detail} · no round booked`
              : current.detail}
        </p>
      </div>
      <div className="mt-2 flex gap-[3px]" aria-hidden>
        {steps.map((step) => (
          <span
            key={step.key}
            title={`${step.label}${step.detail ? ` · ${step.detail}` : ""}`}
            className={cn(
              "h-1.5 min-w-0 flex-1 rounded-full",
              step.state === "done" && "bg-primary",
              step.state === "current" && (step.due ? "bg-warning" : "bg-primary/60"),
              step.state === "expected" &&
                "bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_7px)]",
              step.state === "future" && "bg-muted",
            )}
          />
        ))}
      </div>
      {!compact && (
        <ol className="m-0 mt-1.5 hidden list-none gap-[3px] p-0 @xl:flex">
          {steps.map((step) => (
            <li
              key={step.key}
              className={cn(
                "min-w-0 flex-1 truncate text-[11px] text-muted-foreground",
                step.state === "current" && "font-semibold text-foreground",
              )}
              title={step.label}
            >
              {step.label}
            </li>
          ))}
        </ol>
      )}
      <ol className="sr-only">
        {steps.map((step) => (
          <li key={step.key}>
            {step.label}: {step.state === "current" ? "current" : step.state}
            {step.detail ? `, ${step.detail}` : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* C. Journey: the current step up front; the full list opens in place. */
function Journey({ app, compact }: { app: GalleryApplication; compact: boolean }) {
  const { steps, current } = currentStep(app);
  const [open, setOpen] = useState(!compact);
  const id = useId();
  const expected = steps.filter((s) => s.state === "expected").length;
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <Dot step={current} small />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-semibold">{current.label}</p>
          <p className={cn("m-0 truncate text-xs text-muted-foreground", current.due && "text-warning")}>
            {current.detail}
            {expected > 0 && ` · ${expected} more expected`}
          </p>
        </div>
        <ExpandButton
          open={open}
          onClick={() => setOpen((v) => !v)}
          controls={id}
          label={open ? "Hide all steps" : "Show all steps"}
        />
      </div>
      <Expand open={open} id={id}>
        <ol className="m-0 mt-3 list-none p-0">
          {steps.map((step, index) => (
            <li key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-6 bottom-0 left-[9px] border-l-2",
                    step.state === "done" ? "border-primary" : "border-dashed border-border",
                  )}
                />
              )}
              <Dot step={step} small />
              <div className="min-w-0 pt-px">
                <p
                  className={cn(
                    "m-0 text-sm",
                    step.state === "current" ? "font-semibold" : step.state === "done" ? "" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
                {step.detail && (
                  <p className={cn("m-0 text-xs text-muted-foreground", step.due && "text-warning")}>
                    {step.detail}
                    {step.state === "expected" && " · from company research"}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Expand>
    </div>
  );
}

export function StageView({ v, app, compact }: { v: Variant; app: GalleryApplication; compact: boolean }) {
  if (v === "A") return <Stepper app={app} compact={compact} />;
  if (v === "B") return <Segments app={app} compact={compact} />;
  return <Journey app={app} compact={compact} />;
}

/** One Applications list row with the chosen progress display. */
export function StageRow({ v, app }: { v: Variant; app: GalleryApplication }) {
  return (
    <div className="@container rounded-card border border-border bg-card p-3.5">
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center">
        <div className="flex min-w-0 items-center gap-3 @3xl:w-56 @3xl:shrink-0">
          <CompanyMark name={app.company} />
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-semibold">{app.company}</p>
            <p className="m-0 flex min-w-0 text-xs text-muted-foreground" title={`${app.role} · Req ${app.req}`}>
              <span className="truncate">{app.role}</span>
              <span className="shrink-0 whitespace-nowrap">&nbsp;· {app.req}</span>
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <StageView v={v} app={app} compact />
        </div>
        <p className="m-0 text-xs text-muted-foreground @3xl:w-44 @3xl:shrink-0 @3xl:text-right">{nextStep(app)}</p>
      </div>
    </div>
  );
}

export function StageDemo({ v, apps }: { v: Variant; apps: GalleryApplication[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="m-0 mb-2 text-xs font-medium text-muted-foreground">In the Applications list</p>
        <div className="flex flex-col gap-2">
          {apps.map((app) => (
            <StageRow key={app.id} v={v} app={app} />
          ))}
        </div>
      </div>
      <div>
        <p className="m-0 mb-2 text-xs font-medium text-muted-foreground">On the application page</p>
        <div className="rounded-card border border-border bg-card p-4">
          <StageView v={v} app={apps[0]} compact={false} />
        </div>
      </div>
    </div>
  );
}
