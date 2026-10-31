"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { useLoadingTask } from "@/components/loading/overlay";
import { formatDayTime } from "@/features/applications/dates";
import type { ProviderId } from "@/services/mail/providers/types";
import { cn } from "@/lib/utils";
import { DroppedList } from "./dropped-list";
import { checkMail } from "./workspace-actions";

const CAP = 180;
export const fetchLimitHint =
  "Fetch reads every message, so it goes back up to 180 days. For older mail, search a company from its page.";
const providerName: Record<ProviderId, string> = { GMAIL: "Gmail", OUTLOOK: "Outlook" };
const counted = ["", "", "both", "all three", "all four"];

/** "Gmail and both Outlook inboxes", from the connected accounts. */
function inboxWords(inboxes: { provider: ProviderId }[]) {
  const groups = (Object.keys(providerName) as ProviderId[])
    .map((provider) => ({
      provider,
      count: inboxes.filter((inbox) => inbox.provider === provider).length,
    }))
    .filter((group) => group.count);
  return groups
    .map(({ provider, count }) =>
      count === 1
        ? providerName[provider]
        : `${counted[count] ?? `all ${count}`} ${providerName[provider]} inboxes`,
    )
    .join(" and ");
}
/** The sentence under the button: which inboxes, which folders, which window. */
export function coverageText(
  inboxes: { provider: ProviderId }[],
  window: { days?: number; lastFetched: string | null },
) {
  if (!inboxes.length) return "Connect an inbox to fetch mail.";
  const since = window.days
    ? `from the last ${window.days} days`
    : window.lastFetched
      ? `since ${formatDayTime(new Date(window.lastFetched))}`
      : "since the inboxes were connected";
  return `Checks ${inboxWords(inboxes)}, every folder including Spam and Trash, for mail ${since}.`;
}
export function clampDays(value: number) {
  const whole = Math.round(Number.isFinite(value) ? value : 1);
  return { days: Math.min(CAP, Math.max(1, whole)), over: whole > CAP };
}

export function DaysField({
  days,
  over,
  onChange,
}: {
  days: number;
  over: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <span className="inline-grid gap-1">
      <span className="inline-flex items-center gap-1.5 text-sm">
        Last
        <input
          type="number"
          min={1}
          max={CAP}
          aria-label="Number of days"
          value={days}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-8! min-h-8! w-18! rounded-full! px-2! py-0! text-center"
        />
        days
      </span>
      {over && <span className="max-w-72 text-xs text-warning">{fetchLimitHint}</span>}
    </span>
  );
}

export type FetchLane = {
  account: string;
  state: "reading" | "done" | "failed";
  page: number;
  kept: number;
  error: string | null;
};
/** One row per inbox while a fetch runs. */
export function FetchProgress({ lanes }: { lanes: FetchLane[] }) {
  if (!lanes.length) return null;
  return (
    <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-xs">
      {lanes.map((lane) => (
        <li key={lane.account} className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{lane.account}</span>
          <span
            className={cn(
              "shrink-0 text-right",
              lane.state === "failed"
                ? "text-destructive"
                : lane.state === "done"
                  ? "text-success"
                  : "text-muted-foreground",
            )}
          >
            {lane.state === "failed"
              ? lane.error
              : lane.state === "done"
                ? `Done, ${lane.kept} kept`
                : `Page ${lane.page}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Gallery Fetch new mail A: the button with its time frame beside it, the coverage
 * sentence under it, a row per inbox while it runs, then what was kept and dropped.
 */
export function FetchMail({
  inboxes,
  lastFetched,
  companies = [],
  className,
}: {
  inboxes: { account: string; provider: ProviderId }[];
  lastFetched: string | null;
  /** For Include this on dropped mail that matched no company. */
  companies?: { key: string; name: string }[];
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [frame, setFrame] = useState<"since" | "days">("since");
  const [range, setRange] = useState({ days: 30, over: false });
  const [lanes, setLanes] = useState<FetchLane[]>([]);
  const [result, setResult] = useState<{
    text: string;
    since: string;
    failed: string[];
  } | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  useLoadingTask(pending, "Fetching mail");
  function run() {
    const since = new Date().toISOString();
    setResult(null);
    setShowDropped(false);
    startTransition(async () => {
      const totals = { kept: 0, needYou: 0, dropped: 0 };
      const progress = new Map<string, FetchLane>();
      let more = false;
      let error: string | undefined;
      try {
        // Last N days applies to the first step; later steps continue that window, and an
        // interrupted fetch resumes from each inbox's checkpoint on the next press.
        for (let call = 0; call < 20; call++) {
          const step = await checkMail(call === 0 && frame === "days" ? range.days : undefined);
          if (step.error || !step.mailCheck) {
            error = step.error ?? "Fetch stopped. Fetched pages are safe; fetch again to continue.";
            break;
          }
          for (const account of step.mailCheck.accounts) {
            const lane = progress.get(account.account) ?? {
              account: account.account,
              state: "reading" as const,
              page: 0,
              kept: 0,
              error: null,
            };
            const read = account.counts.fetched > 0 || account.status === "done";
            progress.set(account.account, {
              ...lane,
              state:
                account.status === "failed"
                  ? "failed"
                  : account.status === "done"
                    ? "done"
                    : "reading",
              page: lane.page + (read ? 1 : 0),
              kept: lane.kept + account.counts.kept,
              error: account.error,
            });
            totals.kept += account.counts.kept;
            totals.needYou += account.counts.newAttention;
            totals.dropped += account.counts.dropped;
          }
          setLanes([...progress.values()]);
          more = step.mailCheck.more;
          if (!more) break;
        }
      } catch {
        error = "Connection interrupted. Fetched pages are safe. Fetch again to continue.";
      }
      const failed = [...progress.values()]
        .filter((lane) => lane.state === "failed")
        .map((lane) => lane.account);
      setResult({
        text:
          error ??
          [
            `${totals.kept} kept, ${totals.needYou} need you, ${totals.dropped} dropped.`,
            more ? "More mail remains; fetch again to continue." : "",
          ]
            .filter(Boolean)
            .join(" "),
        since,
        failed,
      });
      router.refresh();
    });
  }
  const connected = inboxes.length > 0;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !connected}
          onClick={run}
          title={connected ? undefined : "Connect an inbox first"}
          className="morph pressable inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? (
            <Loader2 aria-hidden size={15} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <RefreshCw aria-hidden size={15} />
          )}
          {pending ? "Fetching…" : "Fetch new mail"}
        </button>
        <div
          role="radiogroup"
          aria-label="Time frame"
          className="inline-flex items-center gap-1 rounded-full bg-muted p-1 text-sm"
        >
          {(
            [
              ["since", "Since last fetch"],
              ["days", "Last N days"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={frame === value}
              disabled={pending}
              onClick={() => setFrame(value)}
              className={cn(
                "h-8 rounded-full px-3",
                frame === value ? "bg-card shadow-surface" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {frame === "days" && (
        <div className="mt-3">
          <DaysField
            days={range.days}
            over={range.over}
            onChange={(value) => setRange(clampDays(value))}
          />
        </div>
      )}
      <p className="m-0 mt-2 text-xs text-muted-foreground">
        {coverageText(inboxes, {
          days: frame === "days" ? range.days : undefined,
          lastFetched,
        })}
      </p>
      <FetchProgress lanes={lanes} />
      {result && (
        <div
          role="status"
          className="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/50 px-3 py-2 text-sm"
        >
          <span className="inline-flex items-center gap-1">
            <Check aria-hidden size={14} className="text-success" />
            {result.text}
          </span>
          <button
            type="button"
            aria-expanded={showDropped}
            onClick={() => setShowDropped(!showDropped)}
            className="font-medium text-link hover:underline"
          >
            {showDropped ? "Hide what was dropped" : "See what was dropped"}
          </button>
          {result.failed.map((account) => (
            <span key={account} className="inline-flex items-center gap-1 text-destructive">
              <CircleAlert aria-hidden size={14} />
              Reconnect {account} in Inboxes
            </span>
          ))}
        </div>
      )}
      {result && showDropped && (
        <DroppedList since={result.since} companies={companies} className="mt-3" />
      )}
    </div>
  );
}
