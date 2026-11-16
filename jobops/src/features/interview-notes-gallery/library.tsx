"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuestionBody } from "./questions";
import {
  Complexity,
  Expand,
  ExpandButton,
  HowItWentBadge,
  PatternChip,
  day,
  howItWent,
  useEdgeFade,
} from "./shared";
import type { HowItWent, LibraryEntry, Variant } from "./types";

function useFilter(entries: LibraryEntry[]) {
  const [query, setQuery] = useState("");
  const [outcomes, setOutcomes] = useState<Set<HowItWent>>(() => new Set());
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (outcomes.size === 0 || outcomes.has(e.howItWent)) &&
        (!needle ||
          [e.title, e.company, e.roundName, ...e.patterns].some((s) => s.toLowerCase().includes(needle))),
    );
  }, [entries, query, outcomes]);
  const toggle = (k: HowItWent) =>
    setOutcomes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  return { query, setQuery, outcomes, toggle, rows, clear: () => (setQuery(""), setOutcomes(new Set())) };
}

function Toolbar({ f }: { f: ReturnType<typeof useFilter> }) {
  return (
    <div className="@container flex min-w-0 flex-col gap-2 @2xl:flex-row @2xl:items-center">
      <label className="relative block min-w-0 flex-1">
        <span className="sr-only">Search questions</span>
        <Search aria-hidden size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={f.query}
          onChange={(e) => f.setQuery(e.target.value)}
          placeholder="Search by question, company or pattern"
          className="!rounded-full !pl-10"
        />
      </label>
      <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {(Object.keys(howItWent) as HowItWent[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={f.outcomes.has(k)}
            onClick={() => f.toggle(k)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap",
              f.outcomes.has(k) ? "border-transparent bg-selected text-selected-foreground" : "border-border hover:bg-muted",
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", howItWent[k].dot)} />
            {howItWent[k].short}
          </button>
        ))}
      </div>
    </div>
  );
}

function Empty({ onClear }: { onClear: () => void }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="m-0 text-sm font-medium">No questions match</p>
      <button type="button" onClick={onClear} className="mt-2 text-sm text-link">
        Clear search and filters
      </button>
    </div>
  );
}

function SampleTag() {
  return (
    <span className="shrink-0 rounded-full border border-dashed border-border px-1.5 text-[10px] text-muted-foreground">
      sample
    </span>
  );
}

/* A. Grouped by pattern; each group folds, each question opens in place. */
function Grouped({ entries }: { entries: LibraryEntry[] }) {
  const f = useFilter(entries);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  const { ref: fadeRef, style: fadeStyle } = useEdgeFade<HTMLDivElement>("y");
  const groups = useMemo(() => {
    const map = new Map<string, LibraryEntry[]>();
    for (const row of f.rows) {
      const key = row.patterns[0] ?? "Other";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    for (const list of map.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [f.rows]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Toolbar f={f} />
      <div
        ref={fadeRef}
        style={fadeStyle}
        className="@container relative max-h-[520px] min-w-0 overflow-y-auto rounded-2xl border border-border bg-card"
      >
        {groups.length === 0 && <Empty onClear={f.clear} />}
        {groups.map(([pattern, rows]) => {
          const isClosed = closed.has(pattern);
          const gid = `${base}-${pattern}`;
          return (
            <section key={pattern} aria-labelledby={`${gid}-h`}>
              <div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b border-border bg-card/95 pr-2 pl-4 backdrop-blur">
                <h4 id={`${gid}-h`} className="m-0 min-w-0 flex-1 truncate text-sm font-semibold">
                  {pattern}
                  <span className="ml-2 font-normal text-muted-foreground">{rows.length}</span>
                </h4>
                <ExpandButton
                  open={!isClosed}
                  controls={gid}
                  label={`${isClosed ? "Show" : "Hide"} ${pattern}`}
                  onClick={() =>
                    setClosed((prev) => {
                      const next = new Set(prev);
                      if (next.has(pattern)) next.delete(pattern);
                      else next.add(pattern);
                      return next;
                    })
                  }
                />
              </div>
              <Expand open={!isClosed} id={gid}>
                <ul className="m-0 list-none p-0">
                  {rows.map((row) => {
                    const isOpen = open === row.id;
                    const rid = `${base}-${row.id}`;
                    return (
                      <li key={row.id} className="border-b border-border last:border-b-0">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={rid}
                          onClick={() => setOpen(isOpen ? null : row.id)}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40",
                            isOpen && "bg-muted/30",
                          )}
                        >
                          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", howItWent[row.howItWent].dot)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium" title={row.title}>
                                {row.title}
                              </span>
                              {row.sample && <SampleTag />}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {row.company} · {row.roundName} · {day(row.date)}
                            </span>
                          </span>
                          <span className="hidden shrink-0 @xl:inline-flex">
                            <Complexity time={row.time} space={row.space} />
                          </span>
                        </button>
                        <Expand open={isOpen} id={rid}>
                          <div className="border-t border-border bg-background/40 px-4 py-4">
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                              <HowItWentBadge value={row.howItWent} />
                              <Complexity time={row.time} space={row.space} />
                              {row.patterns.map((p) => (
                                <PatternChip key={p}>{p}</PatternChip>
                              ))}
                            </div>
                            <QuestionBody q={row} />
                          </div>
                        </Expand>
                      </li>
                    );
                  })}
                </ul>
              </Expand>
            </section>
          );
        })}
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        {f.rows.length} of {entries.length} questions
      </p>
    </div>
  );
}

type SortKey = "date" | "title" | "company";

/* B. Table: sort by any column, scroll sideways when narrow, open a question in a side sheet. */
function Table({ entries }: { entries: LibraryEntry[] }) {
  const f = useFilter(entries);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const { ref: xRef, style: xStyle } = useEdgeFade<HTMLDivElement>("x");
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const rows = useMemo(
    () => [...f.rows].sort((a, b) => a[sort.key].localeCompare(b[sort.key]) * sort.dir),
    [f.rows, sort],
  );
  useEffect(() => {
    if (selected) sheet.current?.focus({ preventScroll: true });
    else opener.current?.focus({ preventScroll: true });
  }, [selected]);
  const head = (key: SortKey, label: string, className?: string) => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={cn("sticky top-0 z-10 bg-card px-0 py-0 text-left font-medium", className)}
    >
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "date" ? -1 : 1 }))}
        className="inline-flex h-10 w-full items-center gap-1 px-3 text-xs text-muted-foreground hover:text-foreground"
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp aria-hidden size={12} /> : <ArrowDown aria-hidden size={12} />)}
      </button>
    </th>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Toolbar f={f} />
      <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
        <div ref={xRef} style={xStyle} className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="shadow-[inset_0_-1px_0_var(--border)]">
              <tr>
                {head("title", "Question", "w-[40%]")}
                <th scope="col" className="sticky top-0 z-10 bg-card px-3 text-left text-xs font-medium text-muted-foreground">
                  Pattern
                </th>
                <th scope="col" className="sticky top-0 z-10 bg-card px-3 text-left text-xs font-medium text-muted-foreground">
                  How it went
                </th>
                {head("company", "Company")}
                {head("date", "Date")}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <Empty onClear={f.clear} />
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-t border-border hover:bg-muted/40", selected?.id === row.id && "bg-selected/60")}
                >
                  <td className="max-w-0 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        setSelected(row);
                      }}
                      className="flex w-full min-w-0 items-center gap-2 text-left font-medium hover:text-link"
                    >
                      <span className="truncate" title={row.title}>
                        {row.title}
                      </span>
                      {row.sample && <SampleTag />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {row.patterns.slice(0, 2).map((p) => (
                        <PatternChip key={p}>{p}</PatternChip>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <HowItWentBadge value={row.howItWent} short />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.company}
                    <span className="block text-xs text-muted-foreground">{row.roundName}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{day(row.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Side sheet stays inside the demo frame; Esc or the scrim closes it. */}
        <div
          className={cn(
            "absolute inset-0 z-20 bg-scrim transition-opacity duration-200 motion-reduce:transition-none",
            selected ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setSelected(null)}
          aria-hidden
        />
        <div
          ref={sheet}
          role="dialog"
          aria-modal="true"
          aria-label={selected?.title ?? "Question"}
          tabIndex={-1}
          inert={!selected}
          onKeyDown={(e) => e.key === "Escape" && setSelected(null)}
          className={cn(
            "absolute inset-y-0 right-0 z-30 flex w-full max-w-[560px] flex-col border-l border-border bg-popover shadow-xl outline-none transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
            selected ? "translate-x-0" : "translate-x-full",
          )}
        >
          {selected && (
            <>
              <div className="flex min-w-0 items-start gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-semibold">{selected.title}</p>
                  <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
                    {selected.company} · {selected.roundName} · {day(selected.date)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <HowItWentBadge value={selected.howItWent} />
                    <Complexity time={selected.time} space={selected.space} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-muted"
                  aria-label="Close"
                >
                  <X aria-hidden size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                <QuestionBody q={selected} />
              </div>
            </>
          )}
        </div>
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        {f.rows.length} of {entries.length} questions
      </p>
    </div>
  );
}

export function LibraryDemo({ v, entries }: { v: Variant; entries: LibraryEntry[] }) {
  return v === "A" ? <Grouped entries={entries} /> : <Table entries={entries} />;
}
