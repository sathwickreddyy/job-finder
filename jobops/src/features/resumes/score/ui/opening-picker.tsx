"use client";

import { useId, useRef, useEffect, useState, type KeyboardEvent } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScorableOpening } from "../openings";

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function postedLine(o: ScorableOpening) {
  if (!o.postedAt) return "Posting date not recorded";
  const kind = !o.postedAtKind
    ? " (date type not recorded)"
    : o.postedAtKind !== "ORIGINAL"
      ? " (latest publication)"
      : "";
  return `Posted ${shortDay(o.postedAt)}${kind}`;
}

function Flags({ o }: { o: ScorableOpening }) {
  const pill = "rounded-full px-2 py-0.5 text-[11px]";
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {o.tailored && (
        <span className={cn(pill, "bg-selected text-selected-foreground")}>Tailored for this</span>
      )}
      {o.scored && !o.tailored && (
        <span className={cn(pill, "bg-muted text-muted-foreground")}>Scored</span>
      )}
      {o.dateUnknown ? (
        <span className={cn(pill, "bg-warning-soft text-warning")}>Date unknown</span>
      ) : (
        !o.fresh && <span className={cn(pill, "bg-warning-soft text-warning")}>Over 14 days</span>
      )}
    </span>
  );
}

/** The search popup under the pill: saved openings with a description, newest posting first. */
export function OpeningPicker({
  openings,
  error,
  onPick,
  onClose,
}: {
  openings: ScorableOpening[] | null;
  error?: string;
  onPick: (opening: ScorableOpening) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const q = query.trim().toLocaleLowerCase();
  const list = (openings ?? []).filter((o) =>
    `${o.company} ${o.title} ${o.reqId ?? ""} ${o.location}`.toLocaleLowerCase().includes(q),
  );
  function keys(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, list.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && list[active]) {
      event.preventDefault();
      onPick(list[active]);
    } else if (event.key === "Escape") onClose();
  }
  return (
    <div
      role="dialog"
      aria-label="Choose an opening"
      className="mt-2 animate-pop rounded-3xl bg-popover p-2 shadow-surface motion-reduce:animate-none"
    >
      <label className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
        <Search size={14} aria-hidden className="text-muted-foreground" />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={keys}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={list[active] ? `${listId}-${list[active].jobId}` : undefined}
          aria-label="Search saved openings"
          placeholder="Company, role or req id"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      <ul id={listId} role="listbox" className="m-0 mt-1.5 max-h-72 list-none overflow-auto p-0">
        {openings === null && !error && (
          <li className="px-3 py-4 text-xs text-muted-foreground">Loading saved openings…</li>
        )}
        {error && <li className="px-3 py-4 text-xs text-danger-action">{error}</li>}
        {list.map((o, i) => (
          <li
            key={o.jobId}
            id={`${listId}-${o.jobId}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(o)}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2",
              i === active && "bg-muted",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {o.company} · {o.title}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {[o.location, o.reqId, postedLine(o)].filter(Boolean).join(", ")}
              </span>
              <Flags o={o} />
            </span>
            {o.tailored && <Check size={15} className="mt-0.5 shrink-0 text-link" aria-hidden />}
          </li>
        ))}
        {openings !== null && !error && !list.length && (
          <li className="px-3 py-4 text-xs text-muted-foreground">
            No saved opening matches. Save the job description from Find openings first.
          </li>
        )}
      </ul>
    </div>
  );
}
