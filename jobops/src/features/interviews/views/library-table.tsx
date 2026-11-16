"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDay } from "@/features/applications/dates";
import { laneHref } from "@/features/applications/navigation";
import { useEdgeFade } from "@/lib/use-edge-fade";
import { cn } from "@/lib/utils";
import { questionOutcomeValues, type LibraryRow, type QuestionOutcome } from "../types";
import {
  Complexity,
  HowItWentBadge,
  PatternChip,
  QuestionBody,
  outcomeMeta,
} from "./question-body";

type SortKey = "title" | "company" | "date";
const compare: Record<SortKey, (a: LibraryRow, b: LibraryRow) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  company: (a, b) => a.company.localeCompare(b.company) || a.roundLabel.localeCompare(b.roundLabel),
  date: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""),
};
const applicationLink = (row: LibraryRow) => laneHref(row.applicationId, { round: row.roundId });

/**
 * Library B: every recorded question in one sortable table. Search and chips filter the loaded
 * rows; narrow screens scroll the table sideways; a row opens the question in a side sheet.
 */
export function LibraryTable({ rows }: { rows: LibraryRow[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [outcomes, setOutcomes] = useState<Set<QuestionOutcome>>(() => new Set());
  const [pattern, setPattern] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const { ref, style } = useEdgeFade<HTMLDivElement>("x");

  const patterns = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const row of rows)
      for (const p of row.patterns) {
        const key = p.toLowerCase();
        counts.set(key, {
          name: counts.get(key)?.name ?? p,
          count: (counts.get(key)?.count ?? 0) + 1,
        });
      }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [rows]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter(
        (row) =>
          (!outcomes.size || (row.outcome && outcomes.has(row.outcome))) &&
          (!pattern || row.patterns.some((p) => p.toLowerCase() === pattern.toLowerCase())) &&
          (!needle ||
            [row.title, row.company, row.role, row.roundLabel, ...row.patterns].some((text) =>
              text.toLowerCase().includes(needle),
            )),
      )
      .sort((a, b) => compare[sort.key](a, b) * sort.dir || b.id.localeCompare(a.id));
  }, [rows, query, outcomes, pattern, sort]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const filtered = query.trim() !== "" || outcomes.size > 0 || pattern !== null;
  const clear = () => {
    setQuery("");
    setOutcomes(new Set());
    setPattern(null);
  };

  const head = (key: SortKey, label: string, className?: string) => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={cn("sticky top-0 z-10 bg-card p-0 text-left font-medium", className)}
    >
      <button
        type="button"
        onClick={() =>
          setSort((current) => ({
            key,
            dir: current.key === key ? (current.dir === 1 ? -1 : 1) : key === "date" ? -1 : 1,
          }))
        }
        className="inline-flex h-10 w-full items-center gap-1 px-3 text-xs text-muted-foreground hover:text-foreground"
      >
        {label}
        {sort.key === key &&
          (sort.dir === 1 ? (
            <ArrowUp aria-hidden size={12} />
          ) : (
            <ArrowDown aria-hidden size={12} />
          ))}
      </button>
    </th>
  );
  const plainHead = (label: string) => (
    <th
      scope="col"
      className="sticky top-0 z-10 bg-card px-3 text-left text-xs font-medium text-muted-foreground"
    >
      {label}
    </th>
  );

  if (!rows.length)
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center">
        <p className="m-0 font-medium">Questions you record after interviews appear here.</p>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Open an application, find its round and choose Add a question.
        </p>
      </div>
    );

  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-2 @2xl:flex-row @2xl:items-center">
        <label htmlFor={searchId} className="relative block min-w-0 flex-1">
          <span className="sr-only">Search questions</span>
          <Search
            aria-hidden
            size={15}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by question, company, round or pattern"
            className="!rounded-full !pl-10"
          />
        </label>
        <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {questionOutcomeValues.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={outcomes.has(value)}
              onClick={() =>
                setOutcomes((current) => {
                  const next = new Set(current);
                  if (next.has(value)) next.delete(value);
                  else next.add(value);
                  return next;
                })
              }
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                outcomes.has(value)
                  ? "border-transparent bg-selected text-selected-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full", outcomeMeta[value].dot)} />
              {outcomeMeta[value].short}
            </button>
          ))}
        </div>
      </div>
      {patterns.length > 0 && (
        <div role="group" aria-label="Filter by pattern" className="flex min-w-0 flex-wrap gap-1.5">
          {patterns.map(({ name, count }) => {
            const on = pattern?.toLowerCase() === name.toLowerCase();
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => setPattern(on ? null : name)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                  on
                    ? "bg-foreground text-background"
                    : "text-muted-foreground ring-1 ring-border hover:text-foreground",
                )}
              >
                <span className="truncate">{name}</span>
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
        {shown.length === rows.length
          ? `${rows.length} ${rows.length === 1 ? "question" : "questions"}`
          : `${shown.length} of ${rows.length} questions`}
      </p>
      <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
        <div ref={ref} style={style} className="max-h-[calc(100dvh-16rem)] min-h-40 overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="shadow-[inset_0_-1px_0_var(--border)]">
              <tr>
                {head("title", "Question", "w-[38%]")}
                {plainHead("Pattern")}
                {plainHead("How it went")}
                {head("company", "Company")}
                {head("date", "Date")}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <p className="m-0 text-sm font-medium">No questions match</p>
                    {filtered && (
                      <button type="button" onClick={clear} className="mt-2 text-sm text-link">
                        Clear search and filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {shown.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t border-border hover:bg-muted/40",
                    selectedId === row.id && "bg-selected/60",
                  )}
                >
                  <td className="max-w-0 px-3 py-2.5">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        setSelectedId(row.id);
                      }}
                      className="flex w-full min-w-0 text-left font-medium hover:text-link"
                    >
                      <span className="truncate" title={row.title}>
                        {row.title}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex max-w-56 flex-wrap gap-1">
                      {row.patterns.slice(0, 2).map((p) => (
                        <PatternChip key={p}>{p}</PatternChip>
                      ))}
                      {row.patterns.length > 2 && (
                        <span className="text-[11px] text-muted-foreground">
                          +{row.patterns.length - 2}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.outcome ? (
                      <HowItWentBadge value={row.outcome} short />
                    ) : (
                      <span className="text-xs text-muted-foreground">Not recorded</span>
                    )}
                  </td>
                  <td className="max-w-48 px-3 py-2.5">
                    <span className="block truncate" title={row.company}>
                      {row.company}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.roundLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                    {row.date ? formatDay(new Date(row.date)) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <Modal
          open
          label={selected.title}
          onClose={() => setSelectedId(null)}
          returnFocus={() => opener.current}
          className="mr-0 ml-auto h-dvh max-h-dvh w-[min(40rem,100vw)] rounded-none sm:rounded-l-[1.75rem]"
        >
          <header className="flex shrink-0 items-start gap-2 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {selected.company} · {selected.roundLabel}
                {selected.date ? ` · ${formatDay(new Date(selected.date))}` : ""}
              </p>
              <h2 className="m-0 mt-1 text-lg leading-snug font-semibold [overflow-wrap:anywhere]">
                {selected.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {selected.outcome && <HowItWentBadge value={selected.outcome} />}
                <Complexity time={selected.time} space={selected.space} />
                {selected.patterns.map((p) => (
                  <PatternChip key={p}>{p}</PatternChip>
                ))}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelectedId(null)}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X aria-hidden size={18} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <QuestionBody q={selected} />
          </div>
          <footer className="flex shrink-0 flex-wrap gap-2 border-t border-border px-5 py-3 sm:px-6">
            <Link
              href={applicationLink(selected)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-border hover:bg-muted hover:no-underline"
            >
              <ExternalLink aria-hidden size={14} /> Open application
            </Link>
            <Link
              href={applicationLink(selected)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-link hover:bg-muted hover:no-underline"
            >
              <Pencil aria-hidden size={14} /> Edit on its round
            </Link>
          </footer>
        </Modal>
      )}
    </div>
  );
}
