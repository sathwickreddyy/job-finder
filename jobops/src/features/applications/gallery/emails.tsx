"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, BriefcaseBusiness, Check, Link2, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  accounts,
  byId,
  mail as sample,
  mailGroup,
  shortDate,
  timeOf,
  type Account,
  type SampleMail,
} from "./data";
import { AccountTag } from "./marks";

type Handled = NonNullable<SampleMail["handled"]>;

/** Simulated refresh: each inbox finishes on its own, like three API calls in parallel. */
function useRefresh() {
  const [state, setState] = useState<
    Record<Account, { busy: boolean; found: number | null; at: string }>
  >(
    () =>
      Object.fromEntries(
        accounts.map((account, index) => [
          account,
          { busy: false, found: null, at: ["08:40", "08:40", "Yesterday"][index] },
        ]),
      ) as Record<Account, { busy: boolean; found: number | null; at: string }>,
  );
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  const busy = accounts.some((account) => state[account].busy);
  function refresh() {
    if (busy) return;
    setState(
      (rows) =>
        Object.fromEntries(
          accounts.map((account) => [account, { ...rows[account], busy: true, found: null }]),
        ) as typeof rows,
    );
    accounts.forEach((account, index) => {
      timers.current.push(
        window.setTimeout(
          () =>
            setState((rows) => ({
              ...rows,
              [account]: { busy: false, found: [2, 1, 1][index], at: "Just now" },
            })),
          700 + index * 550,
        ),
      );
    });
  }
  return { state, busy, refresh };
}

function useMail() {
  const [rows, setRows] = useState(sample);
  const set = (id: string, handled: Handled | undefined) =>
    setRows((list) => list.map((row) => (row.id === id ? { ...row, handled } : row)));
  return { rows, set };
}

/** The one obvious action for each message. */
function actionFor(message: SampleMail) {
  if (message.match)
    return {
      label: message.kind === "Assessment" ? "Link and add OA" : "Link to record",
      handled: "Linked" as const,
      icon: Link2,
    };
  if (message.kind === "Recruiter outreach")
    return { label: "Save as opening", handled: "Saved" as const, icon: BriefcaseBusiness };
  return { label: "Dismiss", handled: "Dismissed" as const, icon: Archive };
}

function handledText(message: SampleMail) {
  if (message.handled === "Linked") return `Linked to ${byId[message.match!.recordId].company}`;
  if (message.handled === "Saved") return "Saved as an opening";
  return "Dismissed";
}

const kindTone: Record<SampleMail["kind"], string> = {
  Interview: "bg-selected text-selected-foreground",
  Assessment: "bg-selected text-selected-foreground",
  Offer: "bg-success-soft text-success",
  Rejection: "bg-danger-soft text-destructive",
  "Recruiter outreach": "bg-warning-soft text-warning",
  Acknowledgement: "bg-muted text-muted-foreground",
  "Job alert": "bg-muted text-muted-foreground",
};
function KindChip({ kind }: { kind: SampleMail["kind"] }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs whitespace-nowrap", kindTone[kind])}>
      {kind}
    </span>
  );
}

function MatchLine({ message }: { message: SampleMail }) {
  if (!message.match) return null;
  const record = byId[message.match.recordId];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-link">
      <Link2 size={11} aria-hidden />
      {message.match.strength === "Strong" ? "Matches" : "Might be"} {record.company} ·{" "}
      {record.role}
    </span>
  );
}

/* ───────── A · Date-grouped inbox with per-account refresh ───────── */

export function EmailsGrouped() {
  const refresh = useRefresh();
  const { rows, set } = useMail();
  const groups = ["Today", "Yesterday", "This week", "Earlier"];
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-background/60 p-3 ring-1 ring-border">
        <Button
          onClick={refresh.refresh}
          disabled={refresh.busy}
          className="disabled:cursor-wait disabled:opacity-80"
        >
          <RefreshCw size={16} aria-hidden className={cn(refresh.busy && "animate-spin")} />
          {refresh.busy ? "Refreshing" : "Refresh all inboxes"}
        </Button>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
          {accounts.map((account) => {
            const row = refresh.state[account];
            return (
              <li key={account} className="min-w-28">
                <AccountTag account={account} />
                <span
                  className="relative mt-1 block h-1 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500",
                      row.busy ? "w-2/3" : row.found !== null ? "w-full" : "w-0",
                    )}
                  />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                  {row.busy
                    ? "Checking"
                    : row.found !== null
                      ? `${row.found} new · ${row.at}`
                      : row.at}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {groups.map((group) => {
        const list = rows.filter((row) => mailGroup(row.receivedAt) === group);
        if (!list.length) return null;
        return (
          <section key={group} className="space-y-1">
            <h4 className="m-0 mb-1 text-sm font-semibold">{group}</h4>
            {list.map((message) => {
              const action = actionFor(message);
              const Icon = action.icon;
              return (
                <article
                  key={message.id}
                  className={cn(
                    "grid gap-x-4 gap-y-2 rounded-2xl px-3 py-3 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                    message.handled && "opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-semibold">{message.fromName}</span>
                      <KindChip kind={message.kind} />
                      <AccountTag account={message.account} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {group === "Today" || group === "Yesterday"
                          ? timeOf(message.receivedAt)
                          : shortDate(message.receivedAt)}
                      </span>
                    </p>
                    <p className="m-0 mt-0.5 truncate">{message.subject}</p>
                    <MatchLine message={message} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {message.handled ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <Check size={14} aria-hidden />
                          {handledText(message)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 rounded-full"
                          aria-label="Undo"
                          onClick={() => set(message.id, undefined)}
                        >
                          <Undo2 size={14} aria-hidden />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant={action.handled === "Dismissed" ? "outline" : "default"}
                          className="h-8 rounded-full px-3.5"
                          onClick={() => set(message.id, action.handled)}
                        >
                          <Icon size={14} aria-hidden />
                          {action.label}
                        </Button>
                        {action.handled !== "Dismissed" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 rounded-full"
                            aria-label="Dismiss"
                            title="Dismiss"
                            onClick={() => set(message.id, "Dismissed")}
                          >
                            <Archive size={14} aria-hidden />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/* ───────── B · List and reading pane ───────── */

export function EmailsPane() {
  const refresh = useRefresh();
  const { rows, set } = useMail();
  const [account, setAccount] = useState<Account | "All">("All");
  const [selected, setSelected] = useState(rows[1].id);
  const list = rows.filter((row) => account === "All" || row.account === account);
  const message = rows.find((row) => row.id === selected) ?? list[0];
  const action = message ? actionFor(message) : null;
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Inbox"
          className="flex flex-wrap gap-1 rounded-full bg-muted/60 p-1"
        >
          {(["All", ...accounts] as const).map((name) => (
            <button
              key={name}
              role="tab"
              type="button"
              aria-selected={account === name}
              onClick={() => setAccount(name)}
              className={cn(
                "h-8 rounded-full border-0 px-3.5 text-sm",
                account === name
                  ? "bg-card text-foreground shadow-surface"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="ml-auto h-10"
          onClick={refresh.refresh}
          disabled={refresh.busy}
        >
          <RefreshCw size={15} aria-hidden className={cn(refresh.busy && "animate-spin")} />
          {refresh.busy
            ? `Checking ${accounts.filter((name) => refresh.state[name].busy).length} inboxes`
            : refresh.state["gmail.com"].found !== null
              ? `${accounts.reduce((sum, name) => sum + (refresh.state[name].found ?? 0), 0)} new · refresh again`
              : "Refresh"}
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ul className="m-0 max-h-[26rem] list-none space-y-1 overflow-y-auto p-0">
          {list.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelected(row.id)}
                aria-current={row.id === message?.id}
                className={cn(
                  "w-full rounded-2xl border-0 px-3.5 py-3 text-left",
                  row.id === message?.id
                    ? "bg-selected text-selected-foreground"
                    : "bg-transparent text-foreground hover:bg-muted/60",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn("truncate", !row.handled && "font-semibold")}>
                    {row.fromName}
                  </span>
                  <span className="shrink-0 text-xs opacity-75 tabular-nums">
                    {shortDate(row.receivedAt)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-sm opacity-85">{row.subject}</span>
              </button>
            </li>
          ))}
        </ul>
        {message && action && (
          <article
            key={message.id}
            className="ag-fade flex flex-col rounded-3xl bg-background/60 p-5 ring-1 ring-border"
          >
            <div className="flex flex-wrap items-center gap-2">
              <KindChip kind={message.kind} />
              <AccountTag account={message.account} />
            </div>
            <h4 className="m-0 mt-3 text-lg leading-snug font-semibold">{message.subject}</h4>
            <p className="m-0 mt-1 text-sm text-muted-foreground">
              {message.fromName} · {shortDate(message.receivedAt)}, {timeOf(message.receivedAt)}
            </p>
            <p className="m-0 mt-4 flex-1 text-sm leading-relaxed">{message.snippet}</p>
            <div className="mt-5 rounded-2xl bg-card p-4 ring-1 ring-border">
              {message.handled ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Check size={15} aria-hidden className="text-success" />
                    {handledText(message)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3"
                    onClick={() => set(message.id, undefined)}
                  >
                    Undo
                  </Button>
                </div>
              ) : (
                <>
                  <p className="m-0 text-sm">
                    {message.match ? (
                      <>
                        Looks like an update for{" "}
                        <strong>
                          {byId[message.match.recordId].company} ·{" "}
                          {byId[message.match.recordId].role}
                        </strong>
                        .
                      </>
                    ) : message.kind === "Recruiter outreach" ? (
                      "A new role. Save it as an opening to decide later."
                    ) : (
                      "Nothing to track here."
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => set(message.id, action.handled)}>
                      <action.icon size={15} aria-hidden />
                      {action.label}
                    </Button>
                    {action.handled !== "Dismissed" && (
                      <Button variant="ghost" onClick={() => set(message.id, "Dismissed")}>
                        Dismiss
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

/* ───────── C · Triage buckets ───────── */

export function EmailsBuckets() {
  const refresh = useRefresh();
  const { rows, set } = useMail();
  const open = rows.filter((row) => !row.handled);
  const buckets = [
    {
      title: "Updates on your records",
      note: "Link them so the queue and rounds stay current.",
      rows: open.filter((row) => row.match && row.kind !== "Acknowledgement"),
    },
    {
      title: "New roles for you",
      note: "Recruiters reaching out. Save the ones worth a look.",
      rows: open.filter((row) => row.kind === "Recruiter outreach"),
    },
    {
      title: "Probably noise",
      note: "Job alerts and automatic replies.",
      rows: open.filter((row) => row.kind === "Job alert" || row.kind === "Acknowledgement"),
    },
  ];
  const found = accounts.reduce((sum, name) => sum + (refresh.state[name].found ?? 0), 0);
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-selected/60 px-5 py-4">
        <p className="m-0 text-selected-foreground">
          {refresh.busy ? (
            "Checking gmail.com, outlook.in and outlook.com"
          ) : (
            <>
              <strong className="tabular-nums">{open.length}</strong> messages need a decision
              {found > 0 && <span className="opacity-80"> · {found} arrived just now</span>}
            </>
          )}
        </p>
        <Button
          variant="outline"
          className="h-10 bg-card"
          onClick={refresh.refresh}
          disabled={refresh.busy}
        >
          <RefreshCw size={15} aria-hidden className={cn(refresh.busy && "animate-spin")} />
          Refresh all inboxes
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {buckets.map((bucket) => (
          <section
            key={bucket.title}
            className="flex flex-col rounded-3xl bg-background/60 p-4 ring-1 ring-border"
          >
            <h4 className="m-0 font-semibold">
              {bucket.title}{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                {bucket.rows.length}
              </span>
            </h4>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">{bucket.note}</p>
            <ul className="m-0 mt-3 flex-1 list-none space-y-2 p-0">
              {bucket.rows.map((message) => {
                const action = actionFor(message);
                return (
                  <li
                    key={message.id}
                    className="ag-fade rounded-2xl bg-card p-3 ring-1 ring-border"
                  >
                    <p className="m-0 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <AccountTag account={message.account} />
                      <span className="tabular-nums">{shortDate(message.receivedAt)}</span>
                    </p>
                    <p className="m-0 mt-1.5 text-sm font-medium">{message.subject}</p>
                    <MatchLine message={message} />
                    <div className="mt-2.5 flex gap-1.5">
                      <Button
                        size="sm"
                        variant={action.handled === "Dismissed" ? "outline" : "default"}
                        className="h-8 rounded-full px-3"
                        onClick={() => set(message.id, action.handled)}
                      >
                        {action.label}
                      </Button>
                    </div>
                  </li>
                );
              })}
              {!bucket.rows.length && (
                <li className="rounded-2xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                  All clear
                </li>
              )}
            </ul>
            {bucket.title === "Probably noise" && bucket.rows.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 h-8 self-start px-3"
                onClick={() => bucket.rows.forEach((row) => set(row.id, "Dismissed"))}
              >
                <Archive size={14} aria-hidden />
                Dismiss all {bucket.rows.length}
              </Button>
            )}
          </section>
        ))}
      </div>
      {rows.some((row) => row.handled) && (
        <p className="m-0 text-sm text-muted-foreground">
          {rows.filter((row) => row.handled).length} already handled ·{" "}
          <button
            type="button"
            className="border-0 bg-transparent p-0 text-link hover:underline"
            onClick={() =>
              rows.forEach(
                (row) =>
                  row.handled &&
                  !sample.find((s) => s.id === row.id)?.handled &&
                  set(row.id, undefined),
              )
            }
          >
            undo this session
          </button>
        </p>
      )}
    </div>
  );
}
