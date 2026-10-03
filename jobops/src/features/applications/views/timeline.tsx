import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatWhen } from "../dates";
import type { DotTone } from "../lanes";
import { DotIcon } from "./lane-marks";

export type TimelineEntry = {
  key: string;
  at: Date;
  tone: DotTone;
  label: string;
  detail: string;
  tags: string[];
  href?: string;
  extra?: ReactNode;
};

/** Newest first, with a Today divider between what is booked and what happened. */
export function Timeline({ entries, now }: { entries: TimelineEntry[]; now: Date }) {
  const ordered = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (!ordered.length)
    return <p className="m-0 text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ol className="relative m-0 flex list-none flex-col gap-3 p-0 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-0.5 before:-translate-x-1/2 before:bg-border">
      {ordered.map((entry, index) => {
        const upcoming = entry.at > now;
        const divider =
          upcoming && ordered[index + 1] !== undefined && ordered[index + 1].at <= now;
        return (
          <li key={entry.key} className="relative">
            <div className="flex gap-3">
              <DotIcon tone={entry.tone} size="sm" />
              <div className="min-w-0 flex-1 pt-0.5 [overflow-wrap:anywhere]">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={cn("m-0 text-sm", upcoming && "font-medium")}>
                    {entry.href ? <Link href={entry.href}>{entry.label}</Link> : entry.label}
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      upcoming ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatWhen(entry.at, now)}
                  </span>
                </div>
                {entry.detail && (
                  <p className="m-0 text-xs text-muted-foreground">{entry.detail}</p>
                )}
                {entry.extra}
              </div>
            </div>
            {divider && (
              <div className="mt-3 flex items-center gap-2 pl-9 text-[11px] font-semibold text-muted-foreground">
                Today
                <span aria-hidden className="h-0.5 flex-1 rounded-full bg-review" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
