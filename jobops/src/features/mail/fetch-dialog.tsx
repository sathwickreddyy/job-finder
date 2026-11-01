"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Clock, Loader2, PauseCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDayTime, formatTime } from "@/features/applications/dates";
import type { ProviderId } from "@/services/mail/providers/types";
import type { ApiCall, UsageSummary } from "@/services/mail/providers/usage";
import { cn } from "@/lib/utils";
import { DroppedList } from "./dropped-list";
import { duration, groupCalls, type CallGroup } from "./fetch-log";
import type { IngestCounts } from "./ingest";
import { inboxLabels } from "./row-text";

export type FetchLane = {
  account: string;
  provider: ProviderId;
  state: "queued" | "reading" | "done" | "failed" | "waiting";
  /** Pages read so far in this fetch. */
  pages: number;
  counts: IngestCounts;
  calls: ApiCall[];
  usage: UsageSummary | null;
  since: string | null;
  until: string | null;
  error: string | null;
  retryAt: string | null;
};
export type FetchSummary = { text: string; failed: string[] };

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Kolkata",
});
const count = (value: number) => value.toLocaleString("en-IN");
const countdown = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Ticks every second while `active`, for elapsed time and pause countdowns. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function LaneState({ lane, running, now }: { lane: FetchLane; running: boolean; now: number }) {
  const [icon, text, tone] =
    lane.state === "failed"
      ? [CircleAlert, "Couldn't read", "text-destructive"]
      : lane.state === "waiting"
        ? [
            PauseCircle,
            lane.retryAt
              ? `Paused until ${formatTime(new Date(lane.retryAt))}${Date.parse(lane.retryAt) > now ? ` · ${countdown(Date.parse(lane.retryAt) - now)}` : ""}`
              : "Paused",
            "text-warning",
          ]
        : lane.state === "done"
          ? [Check, `Done, ${lane.pages} ${lane.pages === 1 ? "page" : "pages"}`, "text-success"]
          : !running
            ? [Clock, "More mail remains", "text-muted-foreground"]
            : lane.state === "queued"
              ? [Clock, "Waiting for the other inboxes", "text-muted-foreground"]
              : [Loader2, `Reading page ${lane.pages + 1}`, "text-link"];
  const Icon = icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", tone)}>
      <Icon
        aria-hidden
        size={14}
        className={cn(Icon === Loader2 && "animate-spin motion-reduce:animate-none")}
      />
      {text}
    </span>
  );
}

/** The provider's own limit with what JobOps counted inside its window. */
export function QuotaMeter({ usage }: { usage: UsageSummary | null }) {
  if (!usage) return <span className="text-muted-foreground">Nothing sent yet</span>;
  const share = Math.min(1, usage.recent / usage.limit);
  return (
    <span className="grid gap-1.5">
      <span
        role="meter"
        aria-label={`${usage.unit} in the last ${usage.window}`}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.recent}
        className="block h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-selected"
      >
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-300",
            share > 0.85 ? "bg-destructive" : share > 0.6 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${usage.recent ? Math.max(share * 100, 2) : 0}%` }}
        />
      </span>
      <span>
        <span className="font-medium">{count(usage.recent)}</span> of {count(usage.limit)}{" "}
        {usage.unit} in the last {usage.window} · {count(usage.today)} today across{" "}
        {count(usage.callsToday)} {usage.callsToday === 1 ? "request" : "requests"}
        {usage.rateLimitedToday > 0 && (
          <span className="text-warning"> · {count(usage.rateLimitedToday)} refused</span>
        )}
      </span>
      {usage.spacingMs > 0 && (
        <span className="text-warning">
          Slowed to one request every {duration(usage.spacingMs)} after a refusal; it speeds back up
          as requests go through.
        </span>
      )}
    </span>
  );
}

function LogRow({ group }: { group: CallGroup }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 py-1",
        group.reason && "rounded-lg bg-warning-soft px-2 -mx-2",
      )}
    >
      <time dateTime={group.at} className="text-muted-foreground tabular-nums">
        {clock.format(new Date(group.at))}
      </time>
      <span className="font-sans font-medium">
        {group.label}
        {group.count > 1 && <span className="text-muted-foreground"> ×{group.count}</span>}
      </span>
      <span className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
        {group.units} {group.units === 1 ? "unit" : "units"} · {group.statuses} ·{" "}
        {duration(group.ms)}
      </span>
      <span className="col-span-2 col-start-2 break-all text-muted-foreground">
        {group.request}
      </span>
      {group.reason && (
        <span className="col-span-2 col-start-2 font-sans text-foreground">
          Refused: {group.reason}.{" "}
          {group.waitedMs !== undefined
            ? `Waited ${duration(group.waitedMs)}, then sent it again.`
            : "Paused this inbox instead of asking again."}
        </span>
      )}
    </li>
  );
}

/** One inbox: where it is, its window, what it kept and dropped, its quota and every request. */
export function FetchLanes({
  lanes,
  running,
  now,
}: {
  lanes: FetchLane[];
  running: boolean;
  now: number;
}) {
  const labels = inboxLabels(lanes.map((lane) => lane.account));
  return (
    <ul className="m-0 list-none divide-y divide-border p-0">
      {lanes.map((lane) => {
        const units = lane.calls.reduce((sum, call) => sum + call.units, 0);
        const groups = groupCalls(lane.calls);
        return (
          <li key={lane.account} className="grid gap-2.5 py-4 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 truncate font-medium" title={lane.account}>
                {labels[lane.account]}
                <span className="sr-only"> {lane.account}</span>
              </span>
              <LaneState lane={lane} running={running} now={now} />
            </div>
            <dl className="m-0 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Window</dt>
              <dd className="m-0">
                {lane.since ? formatDayTime(new Date(lane.since)) : "Since the last fetch"} →{" "}
                {lane.until ? formatDayTime(new Date(lane.until)) : "now"} · every folder including
                Spam and Trash
              </dd>
              <dt className="text-muted-foreground">Mail</dt>
              <dd className="m-0 tabular-nums">
                Read {count(lane.counts.fetched)} · already here {count(lane.counts.alreadyHere)} ·
                kept {count(lane.counts.kept)} · dropped {count(lane.counts.dropped)}
              </dd>
              <dt className="text-muted-foreground">Quota</dt>
              <dd className="m-0">
                <QuotaMeter usage={lane.usage} />
              </dd>
            </dl>
            {lane.error && (
              <p
                className={cn(
                  "m-0 text-xs",
                  lane.state === "waiting" ? "text-warning" : "text-destructive",
                )}
              >
                {lane.error}
              </p>
            )}
            {groups.length > 0 && (
              <details open className="rounded-2xl bg-muted/60 text-xs">
                <summary className="cursor-pointer px-3 py-2 font-medium select-none">
                  Requests sent in this fetch · {count(lane.calls.length)} · {count(units)}{" "}
                  {lane.usage?.unit ?? "units"}
                </summary>
                <ol className="m-0 max-h-60 list-none overflow-y-auto px-3 pb-2 font-mono text-[11px] leading-relaxed">
                  {/* Newest first, so the request running now is the one in view. */}
                  {groups
                    .map((group, index) => <LogRow key={`${group.at}-${index}`} group={group} />)
                    .reverse()}
                </ol>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Fetch new mail, live: one lane per inbox with its window, counts, quota and the exact
 * requests sent. It stays open when the fetch ends so the result can be read.
 */
export function FetchDialog({
  running,
  stopping,
  lanes,
  startedAt,
  finishedAt,
  summary,
  coverage,
  companies,
  onStop,
  onClose,
}: {
  running: boolean;
  stopping: boolean;
  lanes: FetchLane[];
  startedAt: string;
  finishedAt: number | null;
  summary: FetchSummary | null;
  coverage: string;
  companies: { key: string; name: string }[];
  onStop: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [showDropped, setShowDropped] = useState(false);
  const paused = lanes.some((lane) => lane.state === "waiting");
  const now = useNow(running || paused);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const close = () => {
    if (!running) dialog.current?.close();
  };
  const elapsed = (finishedAt ?? now) - Date.parse(startedAt);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="fetch-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && close()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(46rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-[1.75rem] bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim backdrop:backdrop-blur-sm"
    >
      <div className="reveal grid gap-5 p-6">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="fetch-dialog-title" className="m-0 text-xl font-semibold">
              {running
                ? stopping
                  ? "Stopping after this page…"
                  : "Fetching mail"
                : "Fetch finished"}
            </h2>
            <p className="m-0 mt-1 text-sm text-muted-foreground">{coverage}</p>
          </div>
          <span className="pt-1 text-sm text-muted-foreground tabular-nums">
            {duration(Math.max(0, elapsed))}
          </span>
          {!running && (
            <Button type="button" size="icon" variant="ghost" onClick={close} aria-label="Close">
              <X size={20} aria-hidden />
            </Button>
          )}
        </header>
        <div
          role="progressbar"
          aria-label={running ? "Fetching mail" : "Fetch finished"}
          {...(running ? {} : { "aria-valuenow": 100, "aria-valuemin": 0, "aria-valuemax": 100 })}
          className="h-1 overflow-hidden rounded-full bg-selected"
        >
          <div
            className={cn(
              "h-full rounded-full bg-primary",
              running ? "w-2/5 animate-indeterminate" : "w-full",
            )}
          />
        </div>
        <FetchLanes lanes={lanes} running={running} now={now} />
        {summary && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/50 px-3 py-2 text-sm"
          >
            <span className="inline-flex items-center gap-1">
              <Check aria-hidden size={14} className="text-success" />
              {summary.text}
            </span>
            <button
              type="button"
              aria-expanded={showDropped}
              onClick={() => setShowDropped(!showDropped)}
              className="font-medium text-link hover:underline"
            >
              {showDropped ? "Hide what was dropped" : "See what was dropped"}
            </button>
            {summary.failed.map((account) => (
              <span key={account} className="inline-flex items-center gap-1 text-destructive">
                <CircleAlert aria-hidden size={14} />
                Reconnect {account} in Inboxes
              </span>
            ))}
          </div>
        )}
        {summary && showDropped && <DroppedList since={startedAt} companies={companies} />}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="m-0 max-w-md text-xs text-muted-foreground">
            Counted by JobOps from the requests it sent; Google and Microsoft don&apos;t report
            usage per inbox. A rate limit is retried up to three times, then the inbox pauses until
            the provider&apos;s retry time.
          </p>
          {running ? (
            <Button type="button" variant="outline" disabled={stopping} onClick={onStop}>
              {stopping ? "Stopping…" : "Stop after this page"}
            </Button>
          ) : (
            <Button type="button" onClick={close} className="rounded-full">
              Close
            </Button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
