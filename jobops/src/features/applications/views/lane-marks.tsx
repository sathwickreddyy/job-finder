import { Bookmark, CalendarClock, Check, Mail, Send, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DotTone, LaneStatus, StatusTone } from "../lanes";
import type { Due } from "../queue";

const statusTone: Record<StatusTone, { pill: string; dot: string | null }> = {
  interviewing: { pill: "bg-selected text-selected-foreground", dot: "bg-primary" },
  offer: { pill: "bg-success-soft text-success", dot: "bg-success" },
  quiet: { pill: "bg-muted text-foreground", dot: "bg-review" },
  applied: { pill: "bg-muted text-foreground", dot: "bg-muted-foreground" },
  preparing: { pill: "border border-dashed border-border text-muted-foreground", dot: null },
  closed: { pill: "bg-muted text-destructive", dot: "bg-destructive" },
};

export function StatusPill({ status }: { status: LaneStatus }) {
  const tone = statusTone[status.tone];
  return (
    <span
      data-testid="lane-status"
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-2 rounded-full px-3 text-xs font-medium whitespace-nowrap",
        tone.pill,
      )}
    >
      {tone.dot && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone.dot)} />}
      <span className="truncate">{status.label}</span>
    </span>
  );
}

const dotTone: Record<DotTone, { icon: LucideIcon; className: string }> = {
  sent: { icon: Send, className: "bg-muted text-foreground" },
  mail: { icon: Mail, className: "bg-selected text-selected-foreground" },
  good: { icon: Check, className: "bg-success-soft text-success" },
  bad: { icon: X, className: "bg-danger-soft text-destructive" },
  note: { icon: Bookmark, className: "bg-muted text-muted-foreground" },
  upcoming: {
    icon: CalendarClock,
    className: "border-2 border-dashed border-review bg-card text-foreground",
  },
  pending: { icon: Mail, className: "bg-primary text-primary-foreground ring-4 ring-primary/25" },
};

export function DotIcon({ tone, size = "md" }: { tone: DotTone; size?: "sm" | "md" }) {
  const { icon: Icon, className } = dotTone[tone];
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

/** Colour lives in the dot and text; panels stay neutral. */
export const dueStyle: Record<Due | "none", { dot: string; text: string }> = {
  overdue: { dot: "bg-destructive", text: "text-destructive" },
  today: { dot: "bg-review", text: "text-foreground" },
  week: { dot: "bg-primary", text: "text-muted-foreground" },
  none: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
};
