import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Tab } from "../navigation";

const labels: { id: Tab; label: string }[] = [
  { id: "next", label: "Next" },
  { id: "records", label: "Records" },
  { id: "emails", label: "Emails" },
];

export function ApplicationsTabs({
  active,
  counts,
}: {
  active: Tab;
  counts: Record<Tab, number | null>;
}) {
  return (
    <nav
      aria-label="Applications"
      className="flex w-full gap-1 rounded-full bg-muted/60 p-1 sm:w-fit"
    >
      {labels.map((tab) => (
        <Link
          key={tab.id}
          href={`/applications?tab=${tab.id}`}
          aria-current={active === tab.id ? "page" : undefined}
          className={cn(
            "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm sm:gap-2 sm:px-4 hover:no-underline sm:flex-none",
            active === tab.id
              ? "bg-card font-medium text-foreground shadow-surface"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {counts[tab.id] !== null ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                active === tab.id ? "bg-selected text-selected-foreground" : "bg-muted",
              )}
            >
              {counts[tab.id]}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
