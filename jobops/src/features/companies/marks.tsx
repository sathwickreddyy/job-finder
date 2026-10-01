"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { familyFill, initials } from "./format";
import {
  lpa,
  roundFamily,
  roundKindLabel,
  type CompanyMetrics,
  type PayStats,
  type PipelineStage,
} from "./metrics";

/* ───────────────────────── shared marks ───────────────────────── */

export function RangeBar({
  stats,
  scaleMax,
  dots = true,
  tall = false,
}: {
  stats: PayStats;
  scaleMax: number;
  dots?: boolean;
  tall?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const at = (value: number) => `${Math.min(100, (value / scaleMax) * 100)}%`;
  const point = hover === null ? null : stats.points[hover];
  return (
    <div className="relative">
      <div className={cn("relative", tall ? "h-8" : "h-5")}>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted-foreground/60"
          style={{ left: at(stats.min), width: `calc(${at(stats.max)} - ${at(stats.min)})` }}
        />
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full bg-primary/35",
            tall ? "h-4" : "h-2.5",
          )}
          style={{
            left: at(stats.p25),
            width: `max(6px, calc(${at(stats.p75)} - ${at(stats.p25)}))`,
          }}
        />
        <div
          className={cn("absolute top-1/2 w-0.5 -translate-y-1/2 bg-primary", tall ? "h-6" : "h-4")}
          style={{ left: at(stats.median) }}
        />
        {dots &&
          stats.points.map((row, index) => (
            <button
              key={index}
              type="button"
              aria-label={`₹${lpa(row.value)} LPA${row.level ? `, ${row.level}` : ""}`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center"
              style={{ left: at(row.value) }}
            >
              <span
                className={cn(
                  "size-2.5 rounded-full border-2 border-card bg-foreground transition-transform",
                  hover === index && "scale-150",
                )}
              />
            </button>
          ))}
      </div>
      {point && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-popover px-3 py-2 text-xs shadow-surface ring-1 ring-border"
          style={{ left: at(point.value) }}
        >
          <strong className="text-sm tabular-nums">₹{lpa(point.value)} LPA</strong>
          <span className="block text-muted-foreground">
            {[point.level, point.years !== undefined ? `${point.years} yrs` : null]
              .filter(Boolean)
              .join(", ") || "Level not recorded"}
          </span>
        </div>
      )}
    </div>
  );
}

export function MixBar({ metrics, labels = true }: { metrics: CompanyMetrics; labels?: boolean }) {
  const total = metrics.styleMix.reduce((sum, row) => sum + row.count, 0);
  if (!total) return <p className="text-xs text-muted-foreground">No round details yet</p>;
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {metrics.styleMix.map((row) => (
          <span
            key={row.family}
            className={cn(
              "h-full first:rounded-l-full last:rounded-r-full",
              familyFill[row.family],
            )}
            style={{ flexGrow: row.count }}
          />
        ))}
      </div>
      {labels && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {metrics.styleMix.map((row) => (
            <li key={row.family} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", familyFill[row.family])} aria-hidden />
              {row.family} {Math.round((row.count / total) * 100)}%
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StageChip({ stage }: { stage: PipelineStage }) {
  const tone =
    stage === "Offer"
      ? "bg-success-soft text-success"
      : stage === "Interviewing"
        ? "bg-warning-soft text-warning"
        : stage === "Applied"
          ? "bg-selected text-selected-foreground"
          : stage === "Closed"
            ? "bg-danger-soft text-destructive"
            : "bg-muted text-muted-foreground";
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", tone)}>
      {stage}
    </span>
  );
}

export function Monogram({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl bg-selected font-semibold text-selected-foreground",
        large ? "size-14 text-xl" : "size-11 text-lg",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function LoopStepper({ metrics }: { metrics: CompanyMetrics }) {
  if (!metrics.typicalLoop.length)
    return <p className="text-sm text-muted-foreground">No round details yet</p>;
  return (
    <ol className="flex overflow-x-auto pb-2">
      {metrics.typicalLoop.map((kind, index) => (
        <li key={index} className="relative flex min-w-24 flex-1 flex-col items-center text-center">
          {index > 0 && (
            <span className="absolute right-1/2 top-5 z-0 h-0.5 w-full bg-border" aria-hidden />
          )}
          <span
            className={cn(
              "relative z-10 grid size-10 place-items-center rounded-full text-sm font-semibold text-card",
              familyFill[roundFamily(kind)],
            )}
          >
            {index + 1}
          </span>
          <span className="mt-2 text-sm font-medium">{roundKindLabel[kind]}</span>
          <span className="text-xs text-muted-foreground">{roundFamily(kind)}</span>
        </li>
      ))}
    </ol>
  );
}
