"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartView, LaneView, StackView } from "../lanes";
import { laneHref } from "../navigation";
import { CompanyMark } from "./marks";
import { DotIcon, StatusPill, dueStyle } from "./lane-marks";

const columns = "grid grid-cols-[12.5rem_minmax(0,1fr)_10.5rem]";
type Preview = {
  company: string;
  stack: StackView;
  left: number;
  top: number;
  height: number;
  above: boolean;
};

export function LanesChart({
  lanes,
  today,
  ticks,
  openKey,
  detail,
}: ChartView & { openKey: string | null; detail: ReactNode }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewAnchor = useRef<{ element: HTMLButtonElement; left: number; top: number } | null>(
    null,
  );
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function keepPreview() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }
  function hidePreview() {
    keepPreview();
    hideTimer.current = setTimeout(() => setPreview(null), 180);
  }
  function readStack(company: string, stack: StackView, target: HTMLButtonElement) {
    keepPreview();
    const box = target.getBoundingClientRect();
    previewAnchor.current = { element: target, left: box.left, top: box.top };
    const track = target.parentElement;
    // Split edge stacks sit above the dated dots. Keep their previews outside the whole
    // track, so reading one dot never covers the other dot in that company lane.
    const anchor = track?.dataset.edgeTrack ? track.getBoundingClientRect() : box;
    const width = Math.min(384, window.innerWidth - 32);
    const below = window.innerHeight - anchor.bottom - 24;
    const above = anchor.top - 24;
    const height = Math.min(320, Math.max(below, above));
    const placeAbove = below < Math.min(320, above);
    setPreview({
      company,
      stack,
      height,
      above: placeAbove,
      left: Math.max(16, Math.min(box.left - width / 2, window.innerWidth - width - 16)),
      top: placeAbove ? anchor.top - 12 : anchor.bottom + 12,
    });
  }
  useEffect(() => {
    function dismiss(event?: Event) {
      if (!(event instanceof KeyboardEvent) || event.key === "Escape") setPreview(null);
    }
    document.addEventListener("keydown", dismiss);
    window.addEventListener("resize", dismiss);
    // Avoid leaving a floating preview behind when its anchor scrolls away.
    function onScroll(event: Event) {
      if (event.target instanceof Element && event.target.closest('[data-testid="lane-preview"]'))
        return;
      const anchor = previewAnchor.current;
      if (!anchor) return;
      const box = anchor.element.getBoundingClientRect();
      // A scroll event can arrive after hover has captured the already-settled position.
      if (
        !anchor.element.isConnected ||
        Math.abs(box.left - anchor.left) > 0.5 ||
        Math.abs(box.top - anchor.top) > 0.5
      )
        dismiss();
    }
    document.addEventListener("scroll", onScroll, true);
    return () => {
      keepPreview();
      document.removeEventListener("keydown", dismiss);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);
  const [showClosed, setShowClosed] = useState(false);
  const closed = lanes.filter((lane) => lane.group === "closed").length;
  // The open lane always shows, even when it is closed and the rest of Closed is folded away.
  const visible = lanes.filter(
    (lane) => lane.group !== "closed" || showClosed || lane.key === openKey,
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 min-h-6 text-sm text-muted-foreground">
        Hover or focus a dot to preview its events. Select it to open the company timeline.
      </p>
      {preview && (
        <aside
          data-testid="lane-preview"
          role="tooltip"
          aria-label={`${preview.company} activity preview`}
          onMouseEnter={keepPreview}
          onMouseLeave={hidePreview}
          className="fixed z-40 w-[min(24rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover text-popover-foreground shadow-surface"
          style={{
            left: preview.left,
            top: preview.top,
            maxHeight: preview.height,
            transform: preview.above ? "translateY(-100%)" : undefined,
          }}
        >
          <header className="sticky top-0 z-20 border-b border-border bg-popover px-4 py-3">
            <p className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">{preview.company}</p>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">
              {preview.stack.count} {preview.stack.count === 1 ? "event" : "events"}
              {preview.stack.edge === "earlier"
                ? " · Before this calendar window"
                : preview.stack.edge === "later"
                  ? " · After this calendar window"
                  : " · India time"}
            </p>
          </header>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {preview.stack.entries.map((entry) => (
              <li key={entry.key} className="flex items-start gap-2.5 px-4 py-3">
                <span className="mt-0.5 shrink-0">
                  <DotIcon tone={entry.tone} size="sm" />
                </span>
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <p className="m-0 text-sm font-semibold">{entry.label}</p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">{entry.when}</p>
                  {entry.scope && <p className="m-0 mt-1 text-xs font-medium">{entry.scope}</p>}
                  {entry.detail && (
                    <p className="m-0 mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {entry.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="m-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Select the dot to read the full timeline.
          </p>
        </aside>
      )}
      <div
        data-testid="lanes-chart"
        className="@container overflow-x-auto rounded-3xl border border-border bg-card"
      >
        <div className="min-w-[50rem]">
          <div className={cn(columns, "border-b border-border")}>
            <span className="sticky left-0 z-20 bg-card p-3 text-xs font-medium text-muted-foreground">
              Company
            </span>
            <div aria-hidden className="relative mx-5 h-11">
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
                    onRead={(stack, target) => readStack(lane.company, stack, target)}
                    onKeep={keepPreview}
                    onLeave={hidePreview}
                    onBlur={() => setPreview(null)}
                    onOpen={() => {
                      setPreview(null);
                      router.push(laneHref(lane.leadId), { scroll: false });
                    }}
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
  onKeep,
  onLeave,
  onBlur,
  onOpen,
}: {
  lane: LaneView;
  today: number;
  ticks: ChartView["ticks"];
  onRead: (stack: StackView, target: HTMLButtonElement) => void;
  onKeep: () => void;
  onLeave: () => void;
  onBlur: () => void;
  onOpen: () => void;
}) {
  const hasEdge = lane.stacks.some((stack) => stack.edge !== null);
  return (
    <div
      data-edge-track={hasEdge ? "true" : undefined}
      onMouseMove={hasEdge ? onKeep : undefined}
      onMouseLeave={onLeave}
      className={cn(
        "relative isolate mx-5",
        hasEdge ? "h-20" : "h-16",
        lane.group === "closed" && "opacity-60",
      )}
    >
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
          className={cn(
            "absolute h-0.5 -translate-y-1/2 bg-muted-foreground/50",
            hasEdge ? "top-[70%]" : "top-1/2",
          )}
          style={{ left: `${lane.line.from}%`, width: `${lane.line.to - lane.line.from}%` }}
        />
      )}
      {lane.dashed && (
        <span
          aria-hidden
          className={cn(
            "absolute -translate-y-1/2 border-t-2 border-dashed border-muted-foreground/50",
            hasEdge ? "top-[70%]" : "top-1/2",
          )}
          style={{ left: `${lane.dashed.from}%`, width: `${lane.dashed.to - lane.dashed.from}%` }}
        />
      )}
      {lane.stacks.map((stack) => {
        return (
          <button
            key={stack.key}
            type="button"
            aria-label={stack.label}
            onMouseEnter={(event) => onRead(stack, event.currentTarget)}
            onMouseLeave={onLeave}
            onFocus={(event) => onRead(stack, event.currentTarget)}
            onBlur={onBlur}
            onClick={onOpen}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary",
              hasEdge ? (stack.edge ? "top-[30%]" : "top-[70%]") : "top-1/2",
            )}
            style={{ left: `${stack.pct}%` }}
          >
            <DotIcon tone={stack.tone} size="sm" />
            {stack.count > 1 && (
              <span
                aria-hidden
                className="absolute -top-2 -right-2 z-20 grid size-4 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background"
              >
                {stack.count}
              </span>
            )}
            {stack.edge && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground",
                  stack.edge === "earlier" ? "left-full ml-1" : "right-full mr-1",
                )}
              >
                {stack.edge === "earlier" ? "Earlier" : "Later"}
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
