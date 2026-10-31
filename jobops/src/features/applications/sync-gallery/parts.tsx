"use client";

import { Bookmark, CalendarClock, Check, Flag, Inbox, Send, StickyNote, X } from "lucide-react";
import { TagPill } from "@/features/mail/tag-pill";
import { tagClass } from "@/features/mail/tag-pill";
import { cn } from "@/lib/utils";
import {
  NOW,
  reachSteps,
  type SampleApp,
  type SampleMail,
  type SampleStep,
  type StoryItem,
  type Tone,
} from "./data";

const zone = "Asia/Kolkata";
const dayKey = (at: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(at));
const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const weekdays = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const time = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: zone,
});

/** India-date parts, spelled by hand so every browser shows "Sep", never "Sept". */
export function parts(at: string) {
  const [year, month, day] = dayKey(at).split("-").map(Number);
  return {
    day,
    month: months[month - 1],
    weekday: weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
}
/** Calendar days from `from` to `to` in India; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(dayKey(to)) - Date.parse(dayKey(from))) / 86_400_000);
export const shortDay = (at: string) => `${parts(at).day} ${parts(at).month}`;
export const longDay = (at: string) => {
  const p = parts(at);
  return `${p.weekday} ${p.day} ${p.month}`;
};
export const clock = (at: string) => time.format(new Date(at));
/** "Today", "Yesterday", "Tomorrow", then "Tue 3 Nov". */
export function relDay(at: string) {
  const days = daysBetween(NOW, at);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return longDay(at);
}

/** Literal class names so Tailwind keeps every tone; the same pairs as the company pill. */
const toneClass: Record<Tone, string> = {
  preparing: "text-muted-foreground ring-1 ring-inset ring-border",
  applied: "bg-selected text-selected-foreground",
  quiet: "text-warning ring-1 ring-inset ring-warning",
  interviewing: "bg-warning-soft text-warning",
  offer: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-destructive",
  closed: "bg-muted text-muted-foreground",
};

export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-300",
        toneClass[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground",
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** "By Tue 3 Nov", "Overdue since 9 Oct", or nothing when there is no date. */
export function dueText(next: SampleApp["next"]) {
  if (!next.due) return null;
  return next.overdue ? `Overdue since ${shortDay(next.due)}` : `By ${relDay(next.due)}`;
}

export function NextStep({ app, compact }: { app: SampleApp; compact?: boolean }) {
  const due = dueText(app.next);
  const idle = app.group === "closed";
  return (
    <div className={cn("flex min-w-0 items-center gap-3", compact && "gap-2")}>
      <div className="min-w-0 flex-1">
        <p
          className={cn("m-0 line-clamp-2 text-sm", idle ? "text-muted-foreground" : "font-medium")}
        >
          {app.next.label}
        </p>
        {due && (
          <p
            className={cn(
              "m-0 text-xs tabular-nums",
              app.next.overdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {due}
          </p>
        )}
      </div>
      {app.next.action && !compact && (
        <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground">
          {app.next.action}
        </span>
      )}
    </div>
  );
}

const stepIcon = {
  saved: Bookmark,
  sent: Send,
  note: StickyNote,
  round: CalendarClock,
  outcome: Flag,
} satisfies Record<SampleStep["kind"], unknown>;

function MailLine({ mail }: { mail: SampleMail }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <TagPill tag={mail.tag} />
        <span className="truncate text-xs text-muted-foreground">{mail.from}</span>
      </div>
      <p className="m-0 mt-1 text-sm leading-snug font-medium">{mail.subject}</p>
      <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Inbox aria-hidden size={12} />
          {mail.inbox}
        </span>
        {mail.history && <span>Found by company search</span>}
      </p>
    </div>
  );
}

function StepLine({ step }: { step: SampleStep }) {
  const Icon = stepIcon[step.kind];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-border">
        <Icon aria-hidden size={12} className="text-muted-foreground" />
      </span>
      <p className="m-0 text-sm text-muted-foreground">{step.label}</p>
    </div>
  );
}

/** Emails and steps in one dated ledger, newest first, like the Mail timeline. */
export function Story({ items, className }: { items: StoryItem[]; className?: string }) {
  const sorted = [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <ol className={cn("m-0 list-none divide-y divide-border p-0", className)}>
      {sorted.map((item) => {
        const p = parts(item.at);
        return (
          <li key={item.id} className="flex gap-4 py-3">
            <div className="w-12 shrink-0 text-center leading-tight">
              <p className="m-0 text-[11px] text-muted-foreground">{p.weekday}</p>
              <p className="m-0 text-lg font-semibold tabular-nums">{p.day}</p>
              <p className="m-0 text-[11px] text-muted-foreground">{p.month}</p>
            </div>
            {item.type === "mail" ? <MailLine mail={item} /> : <StepLine step={item} />}
            <span className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
              {clock(item.at)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** When each step of the journey was reached, from the story. */
function reachedAt(app: SampleApp): (string | null)[] {
  const mailAt = (tags: string[]) =>
    app.story
      .filter((item): item is SampleMail => item.type === "mail" && tags.includes(item.tag))
      .map((item) => item.at)
      .sort()[0] ?? null;
  return [
    app.appliedAt,
    mailAt(["application"]),
    mailAt(["interviewCall", "interviewProcess"]),
    mailAt(["offer"]),
  ];
}
const endedAt = (app: SampleApp) =>
  app.story
    .filter((item) => item.type === "step" && item.kind === "outcome")
    .map((item) => item.at)[0] ?? null;

const reachDot = [
  "bg-tag-application",
  "bg-tag-application",
  "bg-tag-interview-call",
  "bg-tag-offer",
] as const;

/**
 * Sent, Acknowledged, Interviewing, Offer: filled up to how far it got. A rejection takes the
 * place of the next step, and later steps fade.
 */
export function Journey({ app, className }: { app: SampleApp; className?: string }) {
  const dates = reachedAt(app);
  const stopAt = app.ended ? app.reach + 1 : null;
  return (
    <ol className={cn("m-0 grid list-none grid-cols-4 p-0", className)}>
      {reachSteps.map((label, index) => {
        const reached = index <= app.reach;
        const stop = stopAt === index;
        const after = stopAt !== null && index > stopAt;
        const date = stop ? endedAt(app) : reached ? dates[index] : null;
        const rejected = app.ended === "rejected";
        return (
          <li key={label} className={cn("relative min-w-0", after && "opacity-35")}>
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[11px] right-1/2 left-[-50%] h-0.5 rounded-full",
                  reached ? reachDot[index] : stop && rejected ? "bg-tag-rejection" : "bg-border",
                )}
              />
            )}
            <div className="relative flex flex-col items-center gap-1 text-center">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full",
                  stop
                    ? rejected
                      ? "bg-tag-rejection text-background"
                      : "bg-muted-foreground text-background"
                    : reached
                      ? cn(reachDot[index], "text-background")
                      : "bg-card ring-2 ring-border ring-inset",
                )}
              >
                {stop ? (
                  <X aria-hidden size={14} strokeWidth={3} />
                ) : reached ? (
                  <Check aria-hidden size={14} strokeWidth={3} />
                ) : null}
              </span>
              <span
                className={cn(
                  "truncate text-[11px] leading-tight",
                  stop
                    ? rejected
                      ? "font-medium text-destructive"
                      : "font-medium text-muted-foreground"
                    : reached
                      ? "font-medium"
                      : "text-muted-foreground",
                )}
              >
                {stop
                  ? rejected
                    ? "Rejected"
                    : "Closed"
                  : app.reach === -1 && index === 0
                    ? "Not sent"
                    : label}
              </span>
              <span className="h-3.5 text-[11px] leading-tight text-muted-foreground tabular-nums">
                {date ? shortDay(date) : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The last email as a tag and a day, or the last step when no email came. */
export function LastHeard({ app, stacked }: { app: SampleApp; stacked?: boolean }) {
  const mail = app.story
    .filter((item): item is SampleMail => item.type === "mail")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (!mail) return <span className="text-sm text-muted-foreground">No email yet</span>;
  const label =
    mail.tag === "applicationRejected" || mail.tag === "interviewRejected"
      ? "Rejection"
      : mail.tag === "interviewCall"
        ? "Assessment invite"
        : "Acknowledged";
  const day = (
    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{relDay(mail.at)}</span>
  );
  if (stacked)
    return (
      <span className="grid min-w-0 grid-cols-[0.5rem_minmax(0,1fr)] items-center gap-x-2 leading-tight">
        <span className={cn("size-2 rounded-full", tagClass[mail.tag].dot)} aria-hidden />
        <span className="text-sm">{label}</span>
        <span />
        {day}
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-full", tagClass[mail.tag].dot)} aria-hidden />
      <span className="truncate text-sm">{label}</span>
      {day}
    </span>
  );
}
