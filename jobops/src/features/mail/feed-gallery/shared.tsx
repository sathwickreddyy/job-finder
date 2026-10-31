"use client";

import { DoorOpen, Inbox as InboxIcon } from "lucide-react";
import { clock } from "@/features/timeline/gallery/primitives";
import { cn } from "@/lib/utils";
import { NOW, feedTags, type CompanyStatus, type FeedMail, type FeedTag } from "./data";
import { TagPill } from "./tags";

const zone = "Asia/Kolkata";
const dayKey = (at: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(at));
export { clock };

const daysAgo = (at: string) =>
  Math.round((Date.parse(dayKey(NOW)) - Date.parse(dayKey(at))) / 86_400_000);
const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const weekdays = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
/** India-date parts, spelled by hand so every browser shows "Sep", never "Sept". */
function parts(at: string) {
  const [year, month, day] = dayKey(at).split("-").map(Number);
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const shown = `${day} ${months[month - 1]}${year === Number(dayKey(NOW).slice(0, 4)) ? "" : ` ${year}`}`;
  return { weekday, shown };
}

/** "Today", "Yesterday", "Fri 30 Oct", or "Mon 14 Mar 2022" outside this year. */
export function dayHeading(at: string) {
  if (daysAgo(at) === 0) return "Today";
  if (daysAgo(at) === 1) return "Yesterday";
  const { weekday, shown } = parts(at);
  return `${weekday} ${shown}`;
}
/** Time for today, "Yesterday", then "29 Oct" or "14 Mar 2022". */
export function when(at: string) {
  if (daysAgo(at) === 0) return clock(at);
  if (daysAgo(at) === 1) return "Yesterday";
  return parts(at).shown;
}
/** For what is coming up: "Today", "Tomorrow", then the weekday. */
export function agendaDay(at: string) {
  if (daysAgo(at) === 0) return "Today";
  if (daysAgo(at) === -1) return "Tomorrow";
  return parts(at).weekday;
}

export function byDay<T extends { at: string }>(items: T[]) {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const day = dayHeading(item.at);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** Which inbox and folder an email came from; quiet unless it is not the Inbox. */
export function SourceChip({
  mail,
  className,
}: {
  mail: Pick<FeedMail, "inbox" | "folder">;
  className?: string;
}) {
  const unusual = mail.folder !== "Inbox";
  return (
    <span
      title={`Found in ${mail.inbox}, ${mail.folder}`}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs",
        unusual ? "bg-warning-soft text-warning" : "text-muted-foreground",
        className,
      )}
    >
      <InboxIcon aria-hidden size={12} />
      {mail.inbox.replace("Outlook (", "").replace(")", "")}
      {unusual && <span>{mail.folder}</span>}
    </span>
  );
}

export function TagFilter({
  mails,
  value,
  onChange,
}: {
  mails: FeedMail[];
  value: FeedTag | "all";
  onChange: (tag: FeedTag | "all") => void;
}) {
  const present = feedTags.filter((tag) => mails.some((mail) => mail.tag === tag));
  return (
    <div role="radiogroup" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === "all"}
        onClick={() => onChange("all")}
        className={cn(
          "pressable h-7 rounded-full px-3 text-xs font-medium",
          value === "all"
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground hover:text-foreground",
        )}
      >
        All {mails.length}
      </button>
      {present.map((tag) => (
        <button
          key={tag}
          type="button"
          role="radio"
          aria-checked={value === tag}
          onClick={() => onChange(value === tag ? "all" : tag)}
          className={cn(
            "pressable rounded-full",
            value === tag
              ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
              : "opacity-85 hover:opacity-100",
          )}
        >
          <TagPill tag={tag} className="h-7 pr-2" />
          <span className="sr-only">{mails.filter((mail) => mail.tag === tag).length} emails</span>
        </button>
      ))}
    </div>
  );
}

export const statusMeta: Record<
  CompanyStatus,
  { label: string; tonal: string; text: string; dot: string }
> = {
  offer: {
    label: "Offer",
    tonal: "bg-success-soft text-success",
    text: "text-success",
    dot: "bg-success",
  },
  interviewing: {
    label: "Interviewing",
    tonal: "bg-warning-soft text-warning",
    text: "text-warning",
    dot: "bg-warning",
  },
  applied: {
    label: "Applied",
    tonal: "bg-selected text-selected-foreground",
    text: "text-link",
    dot: "bg-link",
  },
  quiet: {
    label: "Quiet",
    tonal: "text-warning ring-1 ring-inset ring-warning",
    text: "text-warning",
    dot: "bg-warning",
  },
  rejected: {
    label: "Rejected",
    tonal: "bg-danger-soft text-destructive",
    text: "text-destructive",
    dot: "bg-destructive",
  },
  mailOnly: {
    label: "Mail only",
    tonal: "text-muted-foreground ring-1 ring-inset ring-border",
    text: "text-muted-foreground",
    dot: "ring-1 ring-muted-foreground",
  },
  none: {
    label: "No live application",
    tonal: "text-muted-foreground",
    text: "text-muted-foreground",
    dot: "bg-muted",
  },
};

export function StatusPill({ status, className }: { status: CompanyStatus; className?: string }) {
  if (status === "none") return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium",
        statusMeta[status].tonal,
        className,
      )}
    >
      {statusMeta[status].label}
    </span>
  );
}

export function PreviousBadge({ joined, className }: { joined: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      <DoorOpen aria-hidden size={13} />
      Previous employer, joined {joined}
    </span>
  );
}

/** A frame that sizes an option like the product pane it stands in for. */
export function Pane({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-panel bg-card p-4 shadow-surface ring-1 ring-border/60 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
