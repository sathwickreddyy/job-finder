"use client";

import { useState } from "react";
import { BellOff, Check, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { byId, queue as sample, shortDate, timeOf, type Due, type QueueItem } from "./data";
import { CompanyMark, dueTone, reasonIcon, reasonLabel } from "./marks";

const groups: Due[] = ["overdue", "today", "week"];

/** Shared state for every queue option: Done removes, Snooze pushes to this week. */
function useQueue() {
  const [items, setItems] = useState(sample);
  const [last, setLast] = useState<{ text: string; previous: QueueItem[] } | null>(null);
  function done(item: QueueItem) {
    setLast({ text: `Marked done: ${item.title}`, previous: items });
    setItems((rows) => rows.filter((row) => row.id !== item.id));
  }
  function snooze(item: QueueItem) {
    setLast({ text: `Snoozed 2 days: ${item.title}`, previous: items });
    setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, due: "week" } : row)));
  }
  function undo() {
    if (last) setItems(last.previous);
    setLast(null);
  }
  return { items, done, snooze, undo, last, reset: () => (setItems(sample), setLast(null)) };
}

function UndoBar({ last, undo }: { last: { text: string } | null; undo: () => void }) {
  if (!last) return null;
  return (
    <div
      role="status"
      className="ag-rise flex items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background"
    >
      <span className="truncate">{last.text}</span>
      <button
        type="button"
        onClick={undo}
        className="shrink-0 rounded-full border-0 bg-transparent px-2 py-1 font-semibold text-background underline underline-offset-2"
      >
        Undo
      </button>
    </div>
  );
}

/* ───────── A · Date-grouped list ───────── */

export function QueueGrouped() {
  const { items, done, snooze, undo, last } = useQueue();
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-xl font-semibold tracking-tight">Next</h3>
        <p className="m-0 text-sm text-muted-foreground tabular-nums">
          {items.filter((item) => item.due !== "week").length} need you today
        </p>
      </div>
      {groups.map((group) => {
        const rows = items.filter((item) => item.due === group);
        if (!rows.length) return null;
        const tone = dueTone[group];
        return (
          <section key={group} className="space-y-2">
            <h4 className={cn("m-0 flex items-center gap-2 text-sm font-semibold", tone.text)}>
              <span className={cn("size-2 rounded-full", tone.dot)} aria-hidden />
              {tone.label}
              <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
            </h4>
            <ul className="m-0 list-none space-y-1 p-0">
              {rows.map((item) => {
                const Icon = reasonIcon[item.reason];
                const record = byId[item.recordId];
                return (
                  <li
                    key={item.id}
                    className="ag-fade group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-3 hover:bg-muted/60 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <CompanyMark company={record.company} size="sm" />
                    <div className="min-w-0">
                      <p className="m-0 truncate font-medium">{item.title}</p>
                      <p className="m-0 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <Icon size={13} aria-hidden className="shrink-0" />
                        {item.detail}
                      </p>
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:justify-end">
                      <Button
                        size="sm"
                        className="h-8 rounded-full px-3.5"
                        onClick={() => done(item)}
                      >
                        {item.primary}
                      </Button>
                      {item.secondary && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-full px-3"
                          onClick={() => done(item)}
                        >
                          {item.secondary}
                        </Button>
                      )}
                      {group !== "week" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Snooze ${item.title} for 2 days`}
                          title="Snooze 2 days"
                          className="size-8 rounded-full"
                          onClick={() => snooze(item)}
                        >
                          <BellOff size={14} aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!items.length && <Clear />}
      <UndoBar last={last} undo={undo} />
    </div>
  );
}

function Clear() {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
      <p className="m-0 font-semibold">Nothing needs you right now</p>
      <p className="m-0 mt-1 text-sm text-muted-foreground">
        Refresh your inboxes or record a new application.
      </p>
    </div>
  );
}

/* ───────── B · Agenda spine ───────── */

export function QueueAgenda() {
  const { items, done, snooze, undo, last } = useQueue();
  const overdue = items.filter((item) => item.due === "overdue");
  const later = items
    .filter((item) => item.due !== "overdue")
    .sort(
      (a, b) =>
        Number(b.reason === "mail") - Number(a.reason === "mail") ||
        Date.parse(a.dueAt) - Date.parse(b.dueAt),
    );
  const today = later.filter((item) => item.due === "today");
  const week = later.filter((item) => item.due === "week");
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-5 sm:p-6">
      {overdue.length > 0 && (
        <div className="rounded-2xl bg-danger-soft p-4">
          <p className="m-0 mb-3 text-sm font-semibold text-destructive">
            {overdue.length} slipped past their date
          </p>
          <div className="flex flex-wrap gap-2">
            {overdue.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => done(item)}
                className="pressable inline-flex max-w-full items-center gap-2 rounded-full border border-destructive/40 bg-card px-3 py-1.5 text-left text-sm text-foreground hover:border-destructive"
                title={`${item.detail}. Click to mark done.`}
              >
                <span className="font-medium">{byId[item.recordId].company}</span>
                <span className="truncate text-muted-foreground">{item.primary}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <ol className="relative m-0 list-none space-y-0 p-0 pl-6">
        <span
          aria-hidden
          className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full bg-border"
        />
        <li className="relative pb-3">
          <span
            aria-hidden
            className="absolute top-1 -left-6 size-4 rounded-full bg-review ring-4 ring-card"
          />
          <p className="m-0 text-sm font-semibold">Today · Sat 3 Oct</p>
        </li>
        {today.map((item) => (
          <AgendaRow key={item.id} item={item} onDone={done} onSnooze={snooze} />
        ))}
        <li className="relative pt-4 pb-3">
          <span
            aria-hidden
            className="absolute top-5 -left-[22px] size-3 rounded-full bg-primary ring-4 ring-card"
          />
          <p className="m-0 text-sm font-semibold text-muted-foreground">Rest of the week</p>
        </li>
        {week.map((item) => (
          <AgendaRow key={item.id} item={item} onDone={done} onSnooze={snooze} />
        ))}
      </ol>
      {!items.length && <Clear />}
      <UndoBar last={last} undo={undo} />
    </div>
  );
}

function AgendaRow({
  item,
  onDone,
  onSnooze,
}: {
  item: QueueItem;
  onDone: (item: QueueItem) => void;
  onSnooze: (item: QueueItem) => void;
}) {
  const Icon = reasonIcon[item.reason];
  return (
    <li className="ag-fade relative grid gap-1.5 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-3">
      <span className="pt-0.5 text-sm text-muted-foreground tabular-nums">
        {item.reason === "mail"
          ? "New mail"
          : item.due === "today"
            ? timeOf(item.dueAt)
            : shortDate(item.dueAt)}
      </span>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl bg-background/60 px-4 py-3 ring-1 ring-border">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 font-medium">
            <Icon size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="truncate">{item.title}</span>
          </p>
          <p className="m-0 truncate text-sm text-muted-foreground">{item.detail}</p>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full px-3"
            onClick={() => onDone(item)}
          >
            {item.primary}
          </Button>
          {item.due === "today" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-full"
              aria-label="Snooze 2 days"
              onClick={() => onSnooze(item)}
            >
              <BellOff size={14} aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/* ───────── C · Focus card, one at a time ───────── */

export function QueueFocus() {
  const { items, done, snooze, undo, last, reset } = useQueue();
  const [index, setIndex] = useState(0);
  const ordered = groups.flatMap((group) => items.filter((item) => item.due === group));
  const at = Math.min(index, Math.max(0, ordered.length - 1));
  const item = ordered[at];
  const tone = item ? dueTone[item.due] : null;
  const Icon = item ? reasonIcon[item.reason] : Check;
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-xl font-semibold tracking-tight">Next</h3>
        <div className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
          <Button
            size="icon"
            variant="ghost"
            className="size-8 rounded-full"
            aria-label="Previous"
            disabled={at === 0}
            onClick={() => setIndex(at - 1)}
          >
            <ChevronLeft size={16} aria-hidden />
          </Button>
          {ordered.length ? `${at + 1} of ${ordered.length}` : "0 of 0"}
          <Button
            size="icon"
            variant="ghost"
            className="size-8 rounded-full"
            aria-label="Next item"
            disabled={at >= ordered.length - 1}
            onClick={() => setIndex(at + 1)}
          >
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      </div>
      {item && tone ? (
        <div className="relative pb-3">
          {ordered.length > 1 && (
            <div
              aria-hidden
              className="absolute inset-x-6 bottom-0 h-6 rounded-b-3xl bg-muted/70"
            />
          )}
          <article
            key={item.id}
            className="ag-pop relative rounded-3xl bg-background p-6 ring-1 ring-border"
          >
            <div className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
                  tone.soft,
                  tone.text,
                )}
              >
                <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
                {tone.label}
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Icon size={13} aria-hidden />
                {reasonLabel[item.reason]}
              </span>
            </div>
            <div className="mt-5 flex items-start gap-4">
              <CompanyMark company={byId[item.recordId].company} />
              <div className="min-w-0">
                <p className="m-0 text-2xl leading-tight font-semibold tracking-tight">
                  {item.title}
                </p>
                <p className="m-0 mt-1.5 text-muted-foreground">{item.detail}</p>
                <p className="m-0 mt-1 text-sm text-muted-foreground">{byId[item.recordId].role}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => done(item)}>{item.primary}</Button>
              {item.secondary && (
                <Button variant="outline" onClick={() => done(item)}>
                  {item.secondary}
                </Button>
              )}
              {item.due !== "week" && (
                <Button variant="ghost" onClick={() => snooze(item)}>
                  <BellOff size={15} aria-hidden />
                  Snooze 2 days
                </Button>
              )}
            </div>
          </article>
        </div>
      ) : (
        <div className="space-y-3">
          <Clear />
          <Button variant="outline" size="sm" className="h-9 px-4" onClick={reset}>
            <RotateCcw size={14} aria-hidden />
            Restore sample
          </Button>
        </div>
      )}
      <div className="flex gap-1" aria-hidden>
        {ordered.map((row, position) => (
          <span
            key={row.id}
            className={cn(
              "h-1 flex-1 rounded-full",
              dueTone[row.due].dot,
              position === at ? "opacity-100" : "opacity-30",
            )}
          />
        ))}
      </div>
      <UndoBar last={last} undo={undo} />
    </div>
  );
}
