"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartView, LaneView } from "../lanes";
import { laneHref } from "../navigation";
import { CompanyMark } from "./marks";
import { DotIcon, StatusPill, dueStyle } from "./lane-marks";

const columns = "grid grid-cols-[12.5rem_minmax(0,1fr)_10.5rem]";

export function LanesChart({
  lanes,
  today,
  ticks,
  openKey,
  detail,
}: ChartView & { openKey: string | null; detail: ReactNode }) {
  const router = useRouter();
  const [readout, setReadout] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(() =>
    lanes.some((lane) => lane.key === openKey && lane.group === "closed"),
  );
  const closed = lanes.filter((lane) => lane.group === "closed").length;
  const visible = lanes.filter((lane) => lane.group !== "closed" || showClosed);
  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="m-0 min-h-6 text-sm [overflow-wrap:anywhere]">
        {readout ?? (
          <span className="text-muted-foreground">
            Hover a dot to read it. Select a company to open its whole timeline.
          </span>
        )}
      </p>
      <div
        data-testid="lanes-chart"
        className="@container overflow-x-auto rounded-3xl border border-border bg-card"
        onMouseLeave={() => setReadout(null)}
      >
        <div className="min-w-[50rem]">
          <div className={cn(columns, "border-b border-border")}>
            <span className="sticky left-0 z-20 bg-card p-3 text-xs font-medium text-muted-foreground">
              Company
            </span>
            <div aria-hidden className="relative h-11">
              {ticks.map(
                (tick) =>
                  tick.label && (
                    <span
                      key={tick.pct}
                      className="absolute top-3.5 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground"
                      style={{ left: `${tick.pct}%` }}
                    >
                      {tick.label}
                    </span>
                  ),
              )}
              <span
                className="absolute bottom-0 -translate-x-1/2 rounded-t-md bg-review px-2 text-[11px] font-semibold text-review-foreground"
                style={{ left: `${today}%` }}
              >
                Today
              </span>
            </div>
            <span className="p-3 text-xs font-medium text-muted-foreground">Next</span>
          </div>
          {visible.map((lane) => {
            const open = lane.key === openKey;
            return (
              <div
                key={lane.key}
                role="group"
                aria-label={lane.company}
                className="border-b border-border last:border-0"
              >
                <div className={cn(columns, "items-center")}>
                  <Link
                    href={open ? "/applications" : laneHref(lane.leadId)}
                    scroll={false}
                    aria-expanded={open}
                    className={cn(
                      "sticky left-0 z-20 flex min-w-0 flex-col items-start gap-1.5 p-3 text-foreground hover:no-underline",
                      open ? "bg-muted" : "bg-card hover:bg-muted",
                    )}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2.5">
                      <CompanyMark company={lane.company} size="sm" />
                      <span className="truncate text-sm font-semibold">{lane.company}</span>
                    </span>
                    <StatusPill status={lane.status} />
                  </Link>
                  <Track
                    lane={lane}
                    today={today}
                    ticks={ticks}
                    onRead={setReadout}
                    onOpen={() => router.push(laneHref(lane.leadId), { scroll: false })}
                  />
                  <NextCell lane={lane} />
                </div>
                {open && detail && (
                  <div className="sticky left-0 w-[100cqw] border-t border-border">{detail}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {closed > 0 && (
        <button
          type="button"
          aria-expanded={showClosed}
          onClick={() => setShowClosed((value) => !value)}
          className="pressable inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          Closed · {closed}
          <ChevronDown
            size={15}
            aria-hidden
            className={cn("transition-transform", showClosed && "rotate-180")}
          />
        </button>
      )}
    </div>
  );
}

function Track({
  lane,
  today,
  ticks,
  onRead,
  onOpen,
}: {
  lane: LaneView;
  today: number;
  ticks: ChartView["ticks"];
  onRead: (text: string | null) => void;
  onOpen: () => void;
}) {
  return (
    <div className={cn("relative h-16", lane.group === "closed" && "opacity-60")}>
      {ticks.map((tick) => (
        <span
          key={tick.pct}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border/60"
          style={{ left: `${tick.pct}%` }}
        />
      ))}
      <span
        aria-hidden
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-review"
        style={{ left: `${today}%` }}
      />
      {lane.line && (
        <span
          aria-hidden
          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted-foreground/50"
          style={{ left: `${lane.line.from}%`, width: `${lane.line.to - lane.line.from}%` }}
        />
      )}
      {lane.dashed && (
        <span
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed border-muted-foreground/50"
          style={{ left: `${lane.dashed.from}%`, width: `${lane.dashed.to - lane.dashed.from}%` }}
        />
      )}
      {lane.stacks.map((stack) => {
        const read = () => onRead(`${lane.company} · ${stack.lines.join(" · ")}`);
        return (
          <button
            key={stack.key}
            type="button"
            aria-label={stack.label}
            onMouseEnter={read}
            onFocus={read}
            onBlur={() => onRead(null)}
            onClick={onOpen}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
            style={{ left: `${stack.pct}%` }}
          >
            <DotIcon tone={stack.tone} size="sm" />
            {stack.count > 1 && (
              <span className="absolute -top-2 -right-2 z-20 grid size-4 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                {stack.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function NextCell({ lane }: { lane: LaneView }) {
  const next = lane.next;
  if (!next)
    return (
      <span className="p-3 text-xs text-muted-foreground">
        {lane.group === "closed" ? "Done" : "Nothing due"}
      </span>
    );
  const style = dueStyle[next.due ?? "none"];
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 p-3">
      <span className={cn("flex items-center gap-1.5 text-xs font-semibold", style.text)}>
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", style.dot)} />
        {next.when}
      </span>
      <Link
        href={next.href}
        scroll={false}
        aria-label={`${next.action}: ${next.text}`}
        className="text-left text-xs font-medium text-link"
      >
        {next.action}
      </Link>
    </div>
  );
}
