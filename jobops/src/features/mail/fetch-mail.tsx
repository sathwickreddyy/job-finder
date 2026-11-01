"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { formatDayTime } from "@/features/applications/dates";
import type { ProviderId } from "@/services/mail/providers/types";
import { cn } from "@/lib/utils";
import { FetchDialog, type FetchLane, type FetchSummary } from "./fetch-dialog";
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

/**
 * Gallery Fetch new mail A: the button with its time frame beside it and the coverage
 * sentence under it. A press opens the fetch dialog with a lane per inbox; once it is closed,
 * the result stays beside the button with a way back to the details.
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
  const [run, setRun] = useState<{
    startedAt: string;
    finishedAt: number | null;
    coverage: string;
  } | null>(null);
  const [summary, setSummary] = useState<FetchSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false);
  function fetchMail() {
    const startedAt = new Date().toISOString();
    // Each lane shows its inbox's exact window: an unfinished one resumes from its own start.
    const coverage = `${frame === "days" ? `Last ${range.days} days` : "Since the last fetch"}, every folder including Spam and Trash. An inbox with an unfinished window continues it first.`;
    const progress = new Map<string, FetchLane>(
      inboxes.map((inbox) => [
        inbox.account,
        {
          account: inbox.account,
          provider: inbox.provider,
          state: "reading",
          pages: 0,
          counts: { fetched: 0, alreadyHere: 0, kept: 0, dropped: 0, newAttention: 0 },
          calls: [],
          usage: null,
          since: null,
          until: null,
          error: null,
          retryAt: null,
        },
      ]),
    );
    stop.current = false;
    setStopping(false);
    setSummary(null);
    setLanes([...progress.values()]);
    setRun({ startedAt, finishedAt: null, coverage });
    setOpen(true);
    startTransition(async () => {
      const totals = { kept: 0, needYou: 0, dropped: 0 };
      let more = false;
      let error: string | undefined;
      try {
        // Last N days applies to the first step; later steps continue that window, and an
        // interrupted fetch resumes from each inbox's checkpoint on the next press.
        for (let call = 0; call < 20 && !stop.current; call++) {
          const step = await checkMail(call === 0 && frame === "days" ? range.days : undefined);
          if (step.error || !step.mailCheck) {
            error = step.error ?? "Fetch stopped. Fetched pages are safe; fetch again to continue.";
            break;
          }
          for (const account of step.mailCheck.accounts) {
            const lane = progress.get(account.account);
            if (!lane) continue;
            const read = account.counts.fetched > 0 || account.status === "done";
            progress.set(account.account, {
              ...lane,
              state:
                account.status === "more"
                  ? account.calls.length
                    ? "reading"
                    : lane.state === "reading"
                      ? "reading"
                      : "queued"
                  : account.status === "waiting"
                    ? "waiting"
                    : account.status === "failed"
                      ? "failed"
                      : "done",
              pages: lane.pages + (read && account.calls.length ? 1 : 0),
              counts: {
                fetched: lane.counts.fetched + account.counts.fetched,
                alreadyHere: lane.counts.alreadyHere + account.counts.alreadyHere,
                kept: lane.counts.kept + account.counts.kept,
                dropped: lane.counts.dropped + account.counts.dropped,
                newAttention: lane.counts.newAttention + account.counts.newAttention,
              },
              calls: [...lane.calls, ...account.calls],
              usage: account.usage ?? lane.usage,
              since: account.since ?? lane.since,
              until: account.until ?? lane.until,
              error: account.error,
              retryAt: account.retryAt,
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
      const finished = [...progress.values()];
      const paused = finished.filter((lane) => lane.state === "waiting");
      setSummary({
        text:
          error ??
          [
            `${totals.kept} kept, ${totals.needYou} need you, ${totals.dropped} dropped.`,
            stop.current && more
              ? "Stopped; fetch again to continue."
              : more
                ? "More mail remains; fetch again to continue."
                : "",
            paused.length
              ? `${paused.length === 1 ? "One inbox is" : `${paused.length} inboxes are`} paused for a rate limit.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        failed: finished.filter((lane) => lane.state === "failed").map((lane) => lane.account),
      });
      setRun((current) => current && { ...current, finishedAt: Date.now() });
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
          onClick={fetchMail}
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
      {summary && run && !open && (
        <div
          role="status"
          className="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/50 px-3 py-2 text-sm"
        >
          <span className="inline-flex items-center gap-1">
            <Check aria-hidden size={14} className="text-success" />
            {summary.text}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-medium text-link hover:underline"
          >
            Show fetch details
          </button>
          {summary.failed.map((account) => (
            <span key={account} className="inline-flex items-center gap-1 text-destructive">
              <CircleAlert aria-hidden size={14} />
              Reconnect {account} in Inboxes
            </span>
          ))}
        </div>
      )}
      {open && run && (
        <FetchDialog
          running={pending}
          stopping={stopping}
          lanes={lanes}
          startedAt={run.startedAt}
          finishedAt={run.finishedAt}
          summary={summary}
          coverage={run.coverage}
          companies={companies}
          onStop={() => {
            stop.current = true;
            setStopping(true);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
