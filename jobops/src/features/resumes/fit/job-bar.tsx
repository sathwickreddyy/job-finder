"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { indiaDate } from "@/features/mail/attention";
import { cn } from "@/lib/utils";
import type { Fit } from "./service";

const shortDay = (day: string, year = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

function postedLine(target: NonNullable<Fit["target"]>) {
  if (!target.postedAt) return "Posting date not recorded";
  const age = Math.round(
    (Date.parse(indiaDate(new Date())) - Date.parse(target.postedAt)) / 86_400_000,
  );
  return [
    `Posted ${shortDay(target.postedAt)}, ${age <= 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}`,
    // Unknown stays unknown: a date of unrecorded type is never shown as the original posting.
    !target.postedAtKind
      ? " (date type not recorded)"
      : target.postedAtKind !== "ORIGINAL"
        ? " (latest publication)"
        : "",
    target.reqId ? `, req ${target.reqId}` : "",
  ].join("");
}

/** The job this file was tailored for; opens the exact saved description it was scored against. */
export function JobBar({
  target,
  snapshot,
  label = "Job this file is tailored for",
}: {
  target: NonNullable<Fit["target"]>;
  snapshot: NonNullable<Fit["snapshot"]>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        aria-controls="fit-saved-description"
        className="flex w-full items-center gap-3 rounded-[1.75rem] bg-selected px-4 py-2.5 text-left text-selected-foreground"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {target.company} · {target.title}
          </span>
          <span className="block text-xs opacity-80">{postedLine(target)}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div id="fit-saved-description" className="px-1">
          <p className="m-0 mt-3 text-[11px] text-muted-foreground">
            Saved {shortDay(indiaDate(new Date(snapshot.capturedAt)), true)}; scores were measured
            against this text
          </p>
          <div
            tabIndex={0}
            className="mt-1.5 max-h-64 overflow-auto rounded-xl bg-muted p-3 text-xs leading-relaxed whitespace-pre-line text-foreground"
          >
            {snapshot.description}
          </div>
          <a
            href={target.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-link"
          >
            Open the live posting <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      )}
    </section>
  );
}
