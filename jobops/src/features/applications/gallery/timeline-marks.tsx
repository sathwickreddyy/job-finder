"use client";

import { useState } from "react";
import {
  Bookmark,
  CalendarClock,
  Check,
  Inbox,
  Mail,
  RefreshCw,
  Send,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NOW, shortDate, timeOf, type Due } from "./data";
import { AccountTag } from "./marks";
import type { CompanyTimeline, NextStep, NodeTone, StatusTone, StrayMail } from "./timeline-data";

const statusTone: Record<StatusTone, { pill: string; dot: string | null }> = {
  interviewing: { pill: "bg-selected text-selected-foreground", dot: "bg-primary" },
  offer: { pill: "bg-success-soft text-success", dot: "bg-success" },
  quiet: { pill: "bg-muted text-foreground", dot: "bg-review" },
  applied: { pill: "bg-muted text-foreground", dot: "bg-muted-foreground" },
  preparing: { pill: "border border-dashed border-border text-muted-foreground", dot: null },
  closed: { pill: "bg-muted text-destructive", dot: "bg-destructive" },
};

export function StatusPill({ status }: { status: CompanyTimeline["status"] }) {
  const tone = statusTone[status.tone];
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-2 rounded-full px-3 text-xs font-medium whitespace-nowrap",
        tone.pill,
      )}
    >
      {tone.dot && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone.dot)} />}
      {status.label}
    </span>
  );
}

const nodeTone: Record<NodeTone, { icon: LucideIcon; className: string; label: string }> = {
  sent: { icon: Send, className: "bg-muted text-foreground", label: "Applied or asked" },
  mail: { icon: Mail, className: "bg-selected text-selected-foreground", label: "Email" },
  good: { icon: Check, className: "bg-success-soft text-success", label: "Cleared or offer" },
  bad: { icon: X, className: "bg-danger-soft text-destructive", label: "Rejected" },
  note: { icon: Bookmark, className: "bg-muted text-muted-foreground", label: "Noted" },
  upcoming: {
    icon: CalendarClock,
    className: "border-2 border-dashed border-review bg-card text-foreground",
    label: "Coming up",
  },
  pending: {
    icon: Mail,
    className: "bg-primary text-primary-foreground ring-4 ring-primary/25",
    label: "Email not added yet",
  },
};

export function NodeDot({ tone, size = "md" }: { tone: NodeTone; size?: "sm" | "md" }) {
  const { icon: Icon, className } = nodeTone[tone];
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full",
        size === "sm" ? "size-6" : "size-8",
        className,
      )}
    >
      <Icon size={size === "sm" ? 12 : 14} strokeWidth={2.25} />
    </span>
  );
}

export function Legend() {
  const shown: NodeTone[] = ["sent", "mail", "good", "bad", "upcoming", "pending"];
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-muted-foreground">
      {shown.map((tone) => (
        <li key={tone} className="flex items-center gap-2">
          <NodeDot tone={tone} size="sm" />
          {nodeTone[tone].label}
        </li>
      ))}
    </ul>
  );
}

const sameDay = (a: Date, b: Date) =>
  shortDate(a.toISOString()) === shortDate(b.toISOString()) && a.getFullYear() === b.getFullYear();

/** "Today", "Today, 4:00 pm" for anything booked later today, else "3 Oct". */
export function dayLabel(iso: string) {
  const at = new Date(iso);
  if (sameDay(at, NOW)) return at > NOW ? `Today, ${timeOf(iso)}` : "Today";
  return shortDate(iso);
}

export const dueStyle: Record<Due, { soft: string; dot: string; text: string }> = {
  overdue: { soft: "bg-muted", dot: "bg-destructive", text: "text-destructive" },
  today: { soft: "bg-muted", dot: "bg-review", text: "text-foreground" },
  week: { soft: "bg-muted", dot: "bg-primary", text: "text-muted-foreground" },
};

export function NextBox({
  next,
  onAct,
  compact = false,
}: {
  next: NextStep;
  onAct: (label: string) => void;
  compact?: boolean;
}) {
  const style = dueStyle[next.due];
  return (
    <div className={cn("rounded-2xl", compact ? "p-3" : "p-4", style.soft)}>
      <p className={cn("m-0 flex items-center gap-2 text-xs font-semibold", style.text)}>
        <span aria-hidden className={cn("size-2 rounded-full", style.dot)} />
        {next.when}
      </p>
      <p className="m-0 mt-1 text-sm text-foreground">{next.label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={next.due === "week" ? "outline" : "default"}
          onClick={() => onAct(next.action)}
        >
          {next.action}
        </Button>
        {next.secondary && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onAct(next.secondary!)}>
            {next.secondary}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A transient confirmation for gallery-only actions. */
export function useFlash() {
  const [message, setMessage] = useState<string | null>(null);
  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage((current) => (current === text ? null : current)), 2200);
  }
  const node = message ? (
    <div
      role="status"
      className="ag-pop pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4"
    >
      <span className="rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-surface">
        {message}
      </span>
    </div>
  ) : null;
  return { flash, node };
}

function useRefresh() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  function refresh() {
    setState("busy");
    window.setTimeout(() => setState("done"), 900);
  }
  return { state, refresh };
}

function useMailList(initial: StrayMail[]) {
  const [items, setItems] = useState(initial);
  const roles = items.filter((item) => item.pile === "role");
  const noise = items.filter((item) => item.pile === "noise");
  return {
    roles,
    noise,
    remove: (id: string) => setItems((list) => list.filter((item) => item.id !== id)),
    clearNoise: () => setItems((list) => list.filter((item) => item.pile !== "noise")),
  };
}

function ConnectPrompt({ onAct }: { onAct: (label: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3">
      <Inbox size={18} className="text-muted-foreground" aria-hidden />
      <p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground">
        Connect Gmail or Outlook and replies from these companies land on their timelines by
        themselves.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={() => onAct("Connect inboxes")}>
        Connect inboxes
      </Button>
    </div>
  );
}

function RefreshButton({ inboxes }: { inboxes: number }) {
  const { state, refresh } = useRefresh();
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      {state === "done" ? "Refreshed just now · 0 new" : `${inboxes} inboxes · refreshed 9:12 am`}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Refresh inboxes"
        onClick={refresh}
        disabled={state === "busy"}
        className="size-8"
      >
        <RefreshCw size={15} className={cn(state === "busy" && "animate-spin")} aria-hidden />
      </Button>
    </span>
  );
}

/** Mail option A: one slim strip above the timelines. */
export function MailStrip({
  mail,
  inboxes,
  onAct,
}: {
  mail: StrayMail[];
  inboxes: number;
  onAct: (label: string) => void;
}) {
  const { roles, noise, remove, clearNoise } = useMailList(mail);
  if (!inboxes) return <ConnectPrompt onAct={onAct} />;
  const count = roles.length + noise.length;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted px-4 py-3">
      <Mail size={17} className="text-muted-foreground" aria-hidden />
      <span className="text-sm font-medium">
        {count ? `${count} emails aren't about a company here yet` : "No loose emails"}
      </span>
      {roles.map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-2 rounded-full bg-card py-1 pr-1 pl-3 text-xs ring-1 ring-border"
        >
          New role · {item.from.split(" · ").at(-1)}
          <button
            type="button"
            className="pressable rounded-full bg-selected px-2.5 py-1 font-medium text-selected-foreground"
            onClick={() => {
              remove(item.id);
              onAct(`Saved ${item.from.split(" · ").at(-1)} as an opening`);
            }}
          >
            Save as opening
          </button>
        </span>
      ))}
      {noise.length > 0 && (
        <span className="inline-flex items-center gap-2 rounded-full bg-card py-1 pr-1 pl-3 text-xs ring-1 ring-border">
          {noise.length} job alerts
          <button
            type="button"
            className="pressable rounded-full px-2.5 py-1 font-medium hover:bg-muted"
            onClick={() => {
              clearNoise();
              onAct("Dismissed job alerts");
            }}
          >
            Dismiss
          </button>
        </span>
      )}
      <span className="ml-auto">
        <RefreshButton inboxes={inboxes} />
      </span>
    </div>
  );
}

function MailRow({
  item,
  onSave,
  onDismiss,
}: {
  item: StrayMail;
  onSave?: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="rounded-2xl bg-card p-3 ring-1 ring-border">
      <div className="flex items-center justify-between gap-2">
        <AccountTag account={item.account} />
        <span className="text-xs text-muted-foreground">{dayLabel(item.receivedAt)}</span>
      </div>
      <p className="m-0 mt-1 text-sm font-medium">{item.from}</p>
      <p className="m-0 line-clamp-2 text-sm text-muted-foreground">{item.subject}</p>
      <div className="mt-2 flex gap-2">
        {onSave && (
          <Button type="button" size="sm" variant="outline" onClick={onSave}>
            Save as opening
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}

function MailPiles({
  mail,
  inboxes,
  onAct,
}: {
  mail: StrayMail[];
  inboxes: number;
  onAct: (label: string) => void;
}) {
  const { roles, noise, remove, clearNoise } = useMailList(mail);
  if (!inboxes) return <ConnectPrompt onAct={onAct} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-xs text-muted-foreground">
        Replies from companies you applied to go straight onto their timeline. Only the rest lands
        here.
      </p>
      <div>
        <p className="m-0 mb-2 text-xs font-semibold">New roles · {roles.length}</p>
        <ul className="m-0 list-none space-y-2 p-0">
          {roles.map((item) => (
            <MailRow
              key={item.id}
              item={item}
              onSave={() => {
                remove(item.id);
                onAct("Saved as an opening");
              }}
              onDismiss={() => remove(item.id)}
            />
          ))}
          {!roles.length && <li className="text-xs text-muted-foreground">Nothing new.</li>}
        </ul>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="m-0 text-xs font-semibold">Job alerts and auto-replies · {noise.length}</p>
          {noise.length > 0 && (
            <button
              type="button"
              className="pressable rounded-full px-2 py-0.5 text-xs font-medium text-link hover:bg-muted"
              onClick={clearNoise}
            >
              Clear all
            </button>
          )}
        </div>
        <ul className="m-0 list-none space-y-2 p-0">
          {noise.map((item) => (
            <MailRow key={item.id} item={item} onDismiss={() => remove(item.id)} />
          ))}
        </ul>
      </div>
      <RefreshButton inboxes={inboxes} />
    </div>
  );
}

function Ghost({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-3xl border border-border p-4">
          <span className="size-10 rounded-xl bg-muted" />
          <span className="h-3 w-28 rounded-full bg-muted" />
          <span className="h-0.5 flex-1 bg-border" />
          <span className="h-8 w-24 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Mail option B: a side tray next to the timelines. */
export function MailTray({
  mail,
  inboxes,
  onAct,
}: {
  mail: StrayMail[];
  inboxes: number;
  onAct: (label: string) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <Ghost />
      <aside className="rounded-3xl bg-muted p-4">
        <h4 className="m-0 mb-3 flex items-center gap-2 text-sm font-semibold">
          <Inbox size={16} aria-hidden /> Other emails
        </h4>
        <MailPiles mail={mail} inboxes={inboxes} onAct={onAct} />
      </aside>
    </div>
  );
}

/** Mail option C: a header button with a count that opens a drawer. */
export function MailDrawer({
  mail,
  inboxes,
  onAct,
}: {
  mail: StrayMail[];
  inboxes: number;
  onAct: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-h-[26rem] overflow-hidden rounded-3xl border border-border p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-lg font-semibold">Applications</span>
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Mail size={16} aria-hidden />
          {inboxes ? "Other emails" : "Connect inboxes"}
          {inboxes > 0 && mail.length > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {mail.length}
            </span>
          )}
        </Button>
      </div>
      <Ghost rows={5} />
      {open && (
        <>
          <button
            type="button"
            aria-label="Close emails"
            className="absolute inset-0 z-10 bg-scrim"
            onClick={() => setOpen(false)}
          />
          <aside className="ag-fade absolute inset-y-0 right-0 z-20 w-full max-w-sm overflow-y-auto bg-popover p-4 shadow-surface">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="m-0 text-sm font-semibold">Other emails</h4>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X size={16} aria-hidden />
              </Button>
            </div>
            <MailPiles mail={mail} inboxes={inboxes} onAct={onAct} />
          </aside>
        </>
      )}
    </div>
  );
}
