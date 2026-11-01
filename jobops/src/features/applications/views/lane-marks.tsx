import { Bookmark, CalendarClock, Check, Mail, Send, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DotTone } from "../lanes";

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
