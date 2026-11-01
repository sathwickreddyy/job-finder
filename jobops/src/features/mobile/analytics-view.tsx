"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MobileAnalytics } from "./analytics";

export function AnalyticsView({ data }: { data: MobileAnalytics }) {
  const [days, setDays] = useState<7 | 28>(28);
  const [selected, setSelected] = useState<number | null>(null);
  const series = days === 7 ? data.week : data.month;
  const max = Math.max(1, ...series.map((point) => point.value));
  const value =
    selected === null
      ? series.reduce((sum, point) => sum + point.value, 0)
      : series[selected].value;
  return (
    <section aria-label="Your search in numbers" className="space-y-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border">
        {[
          [data.sent, "Applications sent"],
          [data.interviewing, "Interviewing"],
          [data.offers, "Offers received"],
          [data.closed, "Closed"],
        ].map(([count, label]) => (
          <div key={label} className="bg-card px-4 py-4">
            <p className="m-0 text-3xl font-semibold tracking-tight tabular-nums">{count}</p>
            <p className="m-0 mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl bg-card p-5 ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-sm font-semibold">Sending activity</h2>
          <div
            role="group"
            aria-label="Activity period"
            className="flex rounded-full bg-secondary p-1"
          >
            {([7, 28] as const).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={days === period}
                onClick={() => {
                  setDays(period);
                  setSelected(null);
                }}
                className={cn(
                  "min-h-11 rounded-full px-3 text-xs font-medium",
                  days === period
                    ? "bg-selected text-selected-foreground"
                    : "text-muted-foreground",
                )}
              >
                {period} days
              </button>
            ))}
          </div>
        </div>
        <p className="m-0 mt-3" aria-live="polite">
          <strong className="text-2xl font-semibold tabular-nums">{value}</strong>
          <span className="ml-2 text-xs text-muted-foreground">
            {selected === null
              ? `sent in ${days} days`
              : `sent ${days === 28 ? "week of " : "on "}${series[selected].label}`}
          </span>
        </p>
        <div
          className="mt-4 grid h-28 items-end gap-2 border-b border-border"
          style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
        >
          {series.map((point, index) => (
            <button
              key={point.label}
              type="button"
              aria-label={`${point.label}: ${point.value} applications sent`}
              aria-pressed={selected === index}
              onClick={() => setSelected(selected === index ? null : index)}
              className="group flex h-full min-w-0 flex-col justify-end px-1 pt-3"
            >
              <span
                className={cn(
                  "mx-auto block w-full max-w-10 rounded-t-lg transition-colors",
                  selected === index ? "bg-primary" : "bg-primary/65 group-hover:bg-primary",
                )}
                style={{ height: `${(point.value / max) * 88}%` }}
              />
            </button>
          ))}
        </div>
        <div
          className="mt-2 grid gap-2 text-center text-[10px] text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
        >
          {series.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
        <p className="m-0 mt-4 text-xs text-muted-foreground">
          Recorded applications · India time. Unknown sent dates stay off the graph.
        </p>
      </div>
    </section>
  );
}
