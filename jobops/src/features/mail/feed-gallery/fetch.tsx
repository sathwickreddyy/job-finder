"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { inboxes, type Inbox } from "./data";
import { Pane } from "./shared";

const CAP = 180;
const plan: Record<Inbox, { pages: number; kept: number; dropped: number; fails?: boolean }> = {
  Gmail: { pages: 3, kept: 2, dropped: 31 },
  "Outlook (outlook.in)": { pages: 2, kept: 1, dropped: 10 },
  "Outlook (outlook.com)": { pages: 1, kept: 0, dropped: 0, fails: true },
};

/** A scripted fetch: one page per inbox per tick. */
function useFetch() {
  const [frame, setFrame] = useState<"since" | "days">("since");
  const [days, setDays] = useState(30);
  const [tick, setTick] = useState(-1);
  const max = Math.max(...Object.values(plan).map((value) => value.pages));
  const running = tick >= 0 && tick < max;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), 900);
    return () => window.clearTimeout(timer);
  }, [running, tick]);
  const lanes = inboxes.map((inbox) => {
    const p = plan[inbox];
    const read = Math.min(Math.max(tick, 0), p.pages);
    const state =
      tick < 0 ? "idle" : p.fails && tick >= 1 ? "failed" : read >= p.pages ? "done" : "reading";
    return { inbox, state, page: read + 1, pages: p.pages, done: read };
  });
  const finished = tick >= max;
  const window_ = frame === "since" ? "since 8:02 am today" : `from the last ${days} days`;
  return {
    frame,
    setFrame,
    days,
    setDays: (value: number) => setDays(Math.min(CAP, Math.max(1, value || 1))),
    overCap: (value: number) => value > CAP,
    running,
    started: tick >= 0,
    finished,
    lanes,
    window: window_,
    start: () => setTick(0),
  };
}
type Fetch = ReturnType<typeof useFetch>;

function Coverage({ fetch, className }: { fetch: Fetch; className?: string }) {
  return (
    <p className={cn("m-0 text-xs text-muted-foreground", className)}>
      Checks Gmail and both Outlook inboxes, every folder including Spam and Trash, for mail{" "}
      {fetch.window}.
    </p>
  );
}

function DaysInput({ fetch }: { fetch: Fetch }) {
  const [warn, setWarn] = useState(false);
  return (
    <span className="inline-grid gap-1">
      <span className="inline-flex items-center gap-1.5 text-sm">
        Last
        <input
          type="number"
          min={1}
          max={CAP}
          aria-label="Number of days"
          value={fetch.days}
          onFocus={() => fetch.setFrame("days")}
          onChange={(event) => {
            const value = Number(event.target.value);
            setWarn(fetch.overCap(value));
            fetch.setDays(value);
          }}
          className="h-8! min-h-8! w-18! rounded-full! px-2! py-0! text-center"
        />
        days
      </span>
      {warn && (
        <span className="max-w-72 text-xs text-warning">
          Fetch reads every message, so it goes back up to 180 days. For older mail, search a
          company from its page.
        </span>
      )}
    </span>
  );
}

function Progress({ fetch }: { fetch: Fetch }) {
  if (!fetch.started) return null;
  return (
    <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-xs">
      {fetch.lanes.map((lane) => (
        <li key={lane.inbox} className="flex items-center gap-2">
          <span className="w-40 shrink-0 truncate">{lane.inbox}</span>
          <span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                lane.state === "failed" ? "bg-destructive" : "bg-link",
              )}
              style={{
                width: `${lane.state === "failed" ? 100 : (lane.done / lane.pages) * 100}%`,
              }}
            />
          </span>
          <span
            className={cn(
              "w-36 shrink-0 text-right",
              lane.state === "failed"
                ? "text-destructive"
                : lane.state === "done"
                  ? "text-success"
                  : "text-muted-foreground",
            )}
          >
            {lane.state === "failed"
              ? "Sign-in expired"
              : lane.state === "done"
                ? `Done, ${plan[lane.inbox].kept} kept`
                : `Page ${lane.page} of about ${lane.pages}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Result({ fetch }: { fetch: Fetch }) {
  if (!fetch.finished) return null;
  return (
    <p
      role="status"
      className="tl-pop m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/50 px-3 py-2 text-sm"
    >
      <span className="inline-flex items-center gap-1">
        <Check aria-hidden size={14} className="text-success" />3 kept, 1 needs you, 41 dropped.
      </span>
      <button type="button" className="font-medium text-link hover:underline">
        See what was dropped
      </button>
      <span className="inline-flex items-center gap-1 text-destructive">
        <CircleAlert aria-hidden size={14} />
        Reconnect Outlook (outlook.com)
      </span>
    </p>
  );
}

function FetchButton({ fetch, className }: { fetch: Fetch; className?: string }) {
  return (
    <button
      type="button"
      disabled={fetch.running}
      onClick={fetch.start}
      className={cn(
        "morph pressable inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-progress",
        className,
      )}
    >
      {fetch.running ? (
        <Loader2 aria-hidden size={15} className="animate-spin motion-reduce:animate-none" />
      ) : (
        <RefreshCw aria-hidden size={15} />
      )}
      {fetch.running ? "Fetching…" : "Fetch new mail"}
    </button>
  );
}

export function InlineFetch() {
  const fetch = useFetch();
  return (
    <Pane className="max-w-md">
      <div className="flex flex-wrap items-center gap-3">
        <FetchButton fetch={fetch} />
        <div
          role="radiogroup"
          aria-label="Time frame"
          className="inline-flex items-center gap-1 rounded-full bg-muted p-1 text-sm"
        >
          <button
            type="button"
            role="radio"
            aria-checked={fetch.frame === "since"}
            onClick={() => fetch.setFrame("since")}
            className={cn(
              "h-8 rounded-full px-3",
              fetch.frame === "since" ? "bg-card shadow-surface" : "text-muted-foreground",
            )}
          >
            Since last fetch
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={fetch.frame === "days"}
            onClick={() => fetch.setFrame("days")}
            className={cn(
              "h-8 rounded-full px-3",
              fetch.frame === "days" ? "bg-card shadow-surface" : "text-muted-foreground",
            )}
          >
            Last N days
          </button>
        </div>
      </div>
      {fetch.frame === "days" && (
        <div className="tl-pop mt-3">
          <DaysInput fetch={fetch} />
        </div>
      )}
      <Coverage fetch={fetch} className="mt-3" />
      <Progress fetch={fetch} />
      <Result fetch={fetch} />
    </Pane>
  );
}

export function SplitFetch() {
  const fetch = useFetch();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) =>
      !box.current?.contains(event.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  return (
    <Pane className="max-w-md">
      <div ref={box} className="relative inline-flex">
        <FetchButton fetch={fetch} className="rounded-r-none! pr-3" />
        <button
          type="button"
          aria-label="Choose time frame"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
          className="pressable grid h-10 w-10 place-items-center rounded-r-full border-l border-primary-foreground/30 bg-primary text-primary-foreground hover:bg-primary-hover"
        >
          <ChevronDown aria-hidden size={16} />
        </button>
        {menu && (
          <div className="tl-pop absolute top-12 left-0 z-20 w-72 space-y-3 rounded-3xl bg-popover p-3 shadow-surface ring-1 ring-border">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="frame"
                checked={fetch.frame === "since"}
                onChange={() => fetch.setFrame("since")}
                className="mt-1"
              />
              <span>
                Since last fetch
                <span className="block text-xs text-muted-foreground">8:02 am today</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="frame"
                checked={fetch.frame === "days"}
                onChange={() => fetch.setFrame("days")}
                className="mt-1"
              />
              <span className="grid gap-1">
                <DaysInput fetch={fetch} />
                <span className="text-xs text-muted-foreground">
                  Mail you&apos;ve already seen is never shown as new again.
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                fetch.start();
              }}
              className="morph pressable h-9 w-full bg-primary text-sm font-medium text-primary-foreground"
            >
              Fetch {fetch.frame === "since" ? "since last fetch" : `last ${fetch.days} days`}
            </button>
          </div>
        )}
      </div>
      <Coverage fetch={fetch} className="mt-3" />
      <Progress fetch={fetch} />
      <Result fetch={fetch} />
    </Pane>
  );
}
