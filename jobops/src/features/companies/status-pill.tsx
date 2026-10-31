import { DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthLabel, type CompanyStatus, type CompanyStatusTone } from "./status";

/** Literal class names so Tailwind keeps every tone. */
const tone: Record<CompanyStatusTone, string> = {
  preparing: "text-muted-foreground ring-1 ring-inset ring-border",
  applied: "bg-selected text-selected-foreground",
  quiet: "text-warning ring-1 ring-inset ring-warning",
  interviewing: "bg-warning-soft text-warning",
  offer: "bg-success-soft text-success",
  accepted: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-destructive",
  closed: "bg-muted text-muted-foreground",
  mailOnly: "text-muted-foreground ring-1 ring-inset ring-border",
  none: "",
};

/** The company's derived status; nothing when it has no live application or mail. */
export function StatusPill({ status, className }: { status: CompanyStatus; className?: string }) {
  if (status.tone === "none") return null;
  return (
    <span
      title={status.detail}
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium",
        tone[status.tone],
        className,
      )}
    >
      {status.label}
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
      Previous employer, joined {monthLabel(joined)}
    </span>
  );
}
