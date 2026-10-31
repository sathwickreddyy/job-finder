"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Loader2, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  northstarRule,
  northstarRun,
  providerQuery,
  sharedDomains,
  type Inbox,
  type RunItem,
} from "./data";
import { Pane, when } from "./shared";
import { TagPill } from "./tags";

/** When each inbox's pages finish, in ticks of the simulated run. */
const finishesAt: Record<Inbox, number[]> = {
  Gmail: [1, 3],
  "Outlook (outlook.in)": [2],
  "Outlook (outlook.com)": [],
};
const failsAt = 1;
const lastTick = 3;
const DAYS = 90;

type Included = { text: string; keyword?: string; keywordAdded?: boolean };
type Lane = {
  inbox: Inbox;
  state: "waiting" | "searching" | "done" | "failed";
  page: number;
  pages: number;
  fetched: number;
  tracked: number;
  items: RunItem[];
  failure?: string;
};

function includeNote(item: RunItem): Included {
  const domain = item.sender.split("@")[1];
  if (sharedDomains.includes(domain))
    return {
      text: `Kept. ${item.sender} also sends other companies' mail, so it wasn't added to Northstar's addresses.`,
      keyword: item.senderName,
    };
  return { text: `Kept, and added ${item.sender} to Northstar's addresses.` };
}

/** A scripted run: pages land on a timer, and Include this changes an item in place. */
export function useRun() {
  const [tick, setTick] = useState(-1);
  const [included, setIncluded] = useState<Record<string, Included>>({});
  const running = tick >= 0 && tick < lastTick;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [running, tick]);
  const lanes: Lane[] = northstarRun.map((run) => {
    const done = run.pages.filter((_, index) => finishesAt[run.inbox][index] <= tick);
    const failed = Boolean(run.failure) && tick >= failsAt;
    return {
      inbox: run.inbox,
      state:
        tick < 0
          ? "waiting"
          : failed
            ? "failed"
            : done.length === run.pages.length && !run.failure
              ? "done"
              : "searching",
      page: Math.min(done.length + 1, Math.max(run.pages.length, 1)),
      pages: done.length,
      fetched: done.reduce((sum, page) => sum + page.fetched, 0),
      tracked: done.reduce((sum, page) => sum + page.alreadyTracked, 0),
      items: done.flatMap((page) => page.items),
      failure: failed ? run.failure : undefined,
    };
  });
  const items = lanes.flatMap((lane) => lane.items.map((item) => ({ ...item, inbox: lane.inbox })));
  const isKept = (item: RunItem) => item.kept || Boolean(included[item.id]);
  return {
    tick,
    running,
    started: tick >= 0,
    finished: tick >= lastTick,
    lanes,
    items,
    isKept,
    included,
    kept: items.filter(isKept),
    dropped: items.filter((item) => !isKept(item)),
    start() {
      setIncluded({});
      setTick(0);
    },
    include: (item: RunItem) => setIncluded({ ...included, [item.id]: includeNote(item) }),
    addKeyword: (item: RunItem) =>
      setIncluded({ ...included, [item.id]: { ...included[item.id], keywordAdded: true } }),
  };
}
type Run = ReturnType<typeof useRun>;

function Header({ run, title = "Searching Northstar's mail" }: { run: Run; title?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="m-0 text-base font-semibold">
          {run.started ? title : "Search Northstar's mail"}
        </h3>
        <p className="m-0 text-xs text-muted-foreground">
          Last {DAYS} days, 3 inboxes, every folder including Spam
        </p>
      </div>
      <button
        type="button"
        disabled={run.running}
        onClick={run.start}
        className="morph pressable inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-progress"
      >
        {run.running ? (
          <Loader2 aria-hidden size={15} className="animate-spin motion-reduce:animate-none" />
        ) : run.started ? (
          <RotateCcw aria-hidden size={15} />
        ) : (
          <Search aria-hidden size={15} />
        )}
        {run.running ? "Searching…" : run.started ? "Search again" : "Start search"}
      </button>
    </div>
  );
}

function StateLine({ lane }: { lane: Lane }) {
  if (lane.state === "waiting")
    return <span className="text-muted-foreground">Waiting to start</span>;
  if (lane.state === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <CircleAlert aria-hidden size={14} />
        Couldn&apos;t search
      </span>
    );
  if (lane.state === "done")
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Check aria-hidden size={14} />
        Done, {lane.pages} {lane.pages === 1 ? "page" : "pages"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-link">
      <Loader2 aria-hidden size={14} className="animate-spin motion-reduce:animate-none" />
      Reading page {lane.page}
    </span>
  );
}

function Counts({ lane, run }: { lane: Lane; run: Run }) {
  const kept = lane.items.filter(run.isKept).length;
  return (
    <span className="inline-flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
      <span>{lane.fetched} read</span>
      <span>{lane.tracked} already here</span>
      <span className="text-success">{kept} kept</span>
      <span>{lane.items.length - kept} dropped</span>
    </span>
  );
}

function Query({ inbox }: { inbox: Inbox }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Exact search</summary>
      <code className="mt-1 block rounded-lg bg-background px-2 py-1.5 font-mono break-all text-muted-foreground">
        {providerQuery(inbox, northstarRule, DAYS)}
      </code>
    </details>
  );
}

function Result({ item, run, inbox }: { item: RunItem; run: Run; inbox?: Inbox }) {
  const kept = run.isKept(item);
  const note = run.included[item.id];
  return (
    <li className="tl-pop space-y-1.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {kept ? (
          <TagPill tag={item.tag ?? "other"} short />
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-border ring-inset">
            <span className="size-1.5 rounded-full bg-muted-foreground" />
          </span>
        )}
        <span className={cn("min-w-0 flex-1 truncate", !kept && "text-muted-foreground")}>
          {item.subject}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{when(item.at)}</span>
      </div>
      <p className="m-0 flex flex-wrap gap-x-2 pl-8 text-xs text-muted-foreground">
        <span>{item.sender}</span>
        <span>
          {inbox ? `${inbox}, ` : ""}
          {item.folder}
        </span>
      </p>
      {!kept && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs">
          <span className="text-foreground">Dropped: {item.reason}</span>
          <button
            type="button"
            onClick={() => run.include(item)}
            className="font-medium text-link hover:underline"
          >
            Include this
          </button>
        </p>
      )}
      {note && (
        <p className="tl-pop m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-success-soft px-2.5 py-1.5 text-xs text-foreground sm:ml-8">
          <span>{note.text}</span>
          {note.keyword &&
            (note.keywordAdded ? (
              <span className="text-success">Added “{note.keyword}” as a keyword.</span>
            ) : (
              <button
                type="button"
                onClick={() => run.addKeyword(item)}
                className="font-medium text-link hover:underline"
              >
                Add “{note.keyword}” as a keyword
              </button>
            ))}
        </p>
      )}
    </li>
  );
}

function Summary({ run }: { run: Run }) {
  if (!run.finished) return null;
  return (
    <p role="status" className="tl-pop m-0 rounded-2xl bg-muted/50 px-3 py-2 text-sm">
      Finished. {run.kept.length} kept for Northstar, {run.dropped.length} dropped with a reason
      each. Outlook (outlook.com) needs reconnecting before it can be searched.
    </p>
  );
}

export function RowsRun() {
  const run = useRun();
  const [view, setView] = useState<"kept" | "dropped">("kept");
  // Included emails stay on the Dropped tab with their note, so the change is visible where it was made.
  const list = view === "kept" ? run.kept : run.items.filter((item) => !item.kept);
  return (
    <Pane className="space-y-4">
      <Header run={run} />
      <ul className="m-0 list-none divide-y divide-border/60 rounded-2xl bg-muted/30 px-3 py-0">
        {run.lanes.map((lane) => (
          <li key={lane.inbox} className="space-y-1.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">{lane.inbox}</span>
              <StateLine lane={lane} />
            </div>
            {lane.failure ? (
              <p className="m-0 text-xs text-destructive">{lane.failure}</p>
            ) : (
              <Counts lane={lane} run={run} />
            )}
            <div className="flex gap-1" aria-hidden>
              {(northstarRun.find((item) => item.inbox === lane.inbox)?.pages ?? []).map(
                (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1 w-10 rounded-full",
                      index < lane.pages
                        ? "bg-link"
                        : lane.state === "searching" && index === lane.pages
                          ? "animate-pulse bg-link/40"
                          : "bg-muted",
                    )}
                  />
                ),
              )}
            </div>
            <Query inbox={lane.inbox} />
          </li>
        ))}
      </ul>
      {run.started && (
        <div className="space-y-2">
          <div
            role="tablist"
            aria-label="Results"
            className="inline-flex gap-1 rounded-full bg-muted p-1"
          >
            {(["kept", "dropped"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
                className={cn(
                  "h-8 rounded-full px-3.5 text-sm",
                  view === tab ? "bg-card shadow-surface" : "text-muted-foreground",
                )}
              >
                {tab === "kept" ? `Kept ${run.kept.length}` : `Dropped ${run.dropped.length}`}
              </button>
            ))}
          </div>
          <ul className="m-0 list-none divide-y divide-border/60 p-0">
            {list.map((item) => (
              <Result key={item.id} item={item} run={run} inbox={item.inbox} />
            ))}
            {!list.length && (
              <li className="py-3 text-sm text-muted-foreground">
                {run.running ? "Results appear as each page lands." : "Nothing here."}
              </li>
            )}
          </ul>
        </div>
      )}
      <Summary run={run} />
    </Pane>
  );
}

export function LanesRun() {
  const run = useRun();
  return (
    <Pane className="space-y-4">
      <Header run={run} />
      <div className="grid gap-3 lg:grid-cols-3">
        {run.lanes.map((lane) => (
          <section key={lane.inbox} className="min-w-0 space-y-2 rounded-2xl bg-muted/30 p-3">
            <div className="space-y-1">
              <h4 className="m-0 text-sm font-semibold">{lane.inbox}</h4>
              <p className="m-0 text-sm">
                <StateLine lane={lane} />
              </p>
              {lane.failure ? (
                <p className="m-0 text-xs text-destructive">{lane.failure}</p>
              ) : (
                <Counts lane={lane} run={run} />
              )}
              <Query inbox={lane.inbox} />
            </div>
            <ul className="m-0 list-none divide-y divide-border/60 p-0">
              {lane.items.map((item) => (
                <Result key={item.id} item={item} run={run} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Summary run={run} />
    </Pane>
  );
}

export function LogRun() {
  const run = useRun();
  const log: { at: number; text: string; tone?: "bad" }[] = [];
  if (run.started)
    log.push({
      at: 0,
      text: "Started: last 90 days in Gmail, Outlook (outlook.in) and Outlook (outlook.com)",
    });
  for (const raw of northstarRun) {
    raw.pages.forEach((page, index) => {
      const at = finishesAt[raw.inbox][index];
      if (at <= run.tick) {
        const kept = page.items.filter((item) => item.kept).length;
        log.push({
          at,
          text: `${raw.inbox}: page ${index + 1} read ${page.fetched}, ${page.alreadyTracked} already here, ${kept} kept, ${page.items.length - kept} dropped`,
        });
      }
    });
    if (raw.failure && run.tick >= failsAt)
      log.push({ at: failsAt, text: `${raw.inbox}: ${raw.failure}`, tone: "bad" });
  }
  if (run.finished) log.push({ at: lastTick, text: "Finished" });
  log.sort((a, b) => a.at - b.at);
  return (
    <Pane className="space-y-4">
      <Header run={run} />
      <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
        <ol className="m-0 list-none space-y-1.5 rounded-2xl bg-muted/30 p-3 text-xs">
          {log.map((line, index) => (
            <li
              key={index}
              className={cn(
                "tl-pop flex gap-2",
                line.tone === "bad" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              <span className="w-10 shrink-0 tabular-nums">{(line.at * 1.1).toFixed(1)}s</span>
              <span>{line.text}</span>
            </li>
          ))}
          {!run.started && (
            <li className="text-muted-foreground">Each page is logged here as it lands.</li>
          )}
          {run.started && (
            <li className="pt-2">
              <details>
                <summary className="cursor-pointer text-muted-foreground">Exact searches</summary>
                {run.lanes.map((lane) => (
                  <code
                    key={lane.inbox}
                    className="mt-1 block rounded-lg bg-background px-2 py-1.5 font-mono break-all text-muted-foreground"
                  >
                    {lane.inbox}: {providerQuery(lane.inbox, northstarRule, DAYS)}
                  </code>
                ))}
              </details>
            </li>
          )}
        </ol>
        <ul className="m-0 list-none divide-y divide-border/60 p-0">
          {[...run.items]
            .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
            .map((item) => (
              <Result key={item.id} item={item} run={run} inbox={item.inbox} />
            ))}
        </ul>
      </div>
      <Summary run={run} />
    </Pane>
  );
}
