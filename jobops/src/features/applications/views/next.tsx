import Link from "next/link";
import {
  BellOff,
  CalendarClock,
  Hourglass,
  Mail,
  Timer,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { formatDay, formatTime, formatWeekday } from "../dates";
import type { QueueItem, Reason } from "../queue";
import { snoozeQueueItem, unsnoozeQueueItem } from "../record-actions";

const reasonIcon: Record<Reason, LucideIcon> = {
  followup: CalendarClock,
  silence: Hourglass,
  round: Users,
  deadline: Timer,
  mail: Mail,
};

export function NextView({ items, now }: { items: QueueItem[]; now: Date }) {
  if (!items.length)
    return (
      <div className="rounded-panel border border-dashed border-border px-5 py-10 text-center">
        <h2 className="m-0 text-lg font-semibold">Nothing needs you right now</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Refresh your inboxes or record a new application.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/applications?tab=emails">Refresh inboxes</Link>
          </Button>
          <Button asChild>
            <Link href="/applications/new">Record an application</Link>
          </Button>
        </div>
      </div>
    );
  const overdue = items.filter((item) => item.due === "overdue");
  const today = items.filter((item) => item.due === "today");
  const week = items.filter((item) => item.due === "week");
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-4 sm:p-6">
      {overdue.length > 0 && (
        <section aria-labelledby="slipped" className="rounded-2xl bg-danger-soft p-4">
          <h2 id="slipped" className="m-0 mb-3 text-sm font-semibold text-destructive">
            {overdue.length} slipped past {overdue.length === 1 ? "its" : "their"} date
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {overdue.map((item) => (
              <li key={item.key} className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                <Link
                  href={item.primary.href}
                  title={`${item.title}. ${item.detail}`}
                  aria-label={`${item.company ?? item.title}: ${item.primary.label}. ${item.title}. ${item.detail}`}
                  className="pressable inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border border-destructive/40 bg-card px-3 py-1.5 text-sm text-foreground hover:border-destructive hover:no-underline"
                >
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                    {item.company ?? item.title}
                  </span>
                  <span className="text-muted-foreground">{item.primary.label}</span>
                </Link>
                {item.secondary && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="max-w-full rounded-full px-3"
                    asChild
                  >
                    <Link href={item.secondary.href}>{item.secondary.label}</Link>
                  </Button>
                )}
                <SnoozeButton item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <ol className="relative m-0 list-none p-0 pl-6 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-0.5 before:rounded-full before:bg-border before:content-['']">
        <li className="relative pb-3">
          <span
            aria-hidden
            className="absolute top-1 -left-6 size-4 rounded-full bg-review ring-4 ring-card"
          />
          <h2 className="m-0 text-sm font-semibold">Today · {formatWeekday(now)}</h2>
        </li>
        {today.length ? (
          today.map((item) => <AgendaRow key={item.key} item={item} />)
        ) : (
          <li className="py-2 text-sm text-muted-foreground">Nothing else today.</li>
        )}
        <li className="relative pt-4 pb-3">
          <span
            aria-hidden
            className="absolute top-5 -left-[22px] size-3 rounded-full bg-primary ring-4 ring-card"
          />
          <h2 className="m-0 text-sm font-semibold text-muted-foreground">Rest of the week</h2>
        </li>
        {week.length ? (
          week.map((item) => <AgendaRow key={item.key} item={item} />)
        ) : (
          <li className="py-2 text-sm text-muted-foreground">Nothing scheduled yet.</li>
        )}
      </ol>
    </div>
  );
}

function AgendaRow({ item }: { item: QueueItem }) {
  const Icon = reasonIcon[item.reason];
  const when =
    item.reason === "mail"
      ? "New mail"
      : item.due === "week"
        ? formatDay(item.dueAt)
        : formatTime(item.dueAt);
  return (
    <li className="relative grid gap-1.5 py-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3">
      <span className="pt-0.5 text-sm text-muted-foreground tabular-nums">{when}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl bg-background/60 px-4 py-3 ring-1 ring-border">
        <div className="min-w-0 flex-1 basis-full [overflow-wrap:anywhere] sm:basis-56">
          <p className="m-0 flex items-start gap-2 font-medium">
            <Icon size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="min-w-0">{item.title}</span>
          </p>
          <p className="m-0 text-sm text-muted-foreground">{item.detail}</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3" asChild>
            <Link href={item.primary.href}>{item.primary.label}</Link>
          </Button>
          {item.secondary && (
            <Button size="sm" variant="ghost" className="h-8 rounded-full px-3" asChild>
              <Link href={item.secondary.href}>{item.secondary.label}</Link>
            </Button>
          )}
          {item.due !== "week" && <SnoozeButton item={item} />}
        </div>
      </div>
    </li>
  );
}

function SnoozeButton({ item }: { item: QueueItem }) {
  return (
    <ActionForm
      action={snoozeQueueItem}
      className="min-w-0 shrink-0 [&_fieldset]:space-y-0"
      pendingLabel="Snoozing"
    >
      <input type="hidden" name="key" value={item.key} />
      <input type="hidden" name="title" value={item.title} />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        className="size-8 rounded-full"
        aria-label={`Snooze ${item.title} for 2 days`}
        title="Snooze 2 days"
      >
        <BellOff size={14} aria-hidden />
      </Button>
    </ActionForm>
  );
}

export function SnoozeToast({ snoozed }: { snoozed?: { key: string; title: string } }) {
  if (!snoozed) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div className="flex min-w-0 max-w-full items-center gap-3 rounded-2xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-surface">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Snoozed for 2 days: {snoozed.title}
        </span>
        <ActionForm
          action={unsnoozeQueueItem}
          className="shrink-0 [&_fieldset]:space-y-0"
          pendingLabel="Restoring"
        >
          <input type="hidden" name="key" value={snoozed.key} />
          <button
            type="submit"
            className="shrink-0 rounded-full border-0 bg-transparent px-2 py-1 font-semibold text-background underline underline-offset-2"
          >
            Undo
          </button>
        </ActionForm>
        <Link
          href="/applications?tab=next"
          aria-label="Dismiss snooze confirmation"
          className="grid size-8 shrink-0 place-items-center rounded-full text-background hover:no-underline"
        >
          <X size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
