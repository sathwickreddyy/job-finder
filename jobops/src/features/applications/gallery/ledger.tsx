"use client";

import { useState } from "react";
import { Link2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysSince, methodLabel, phases, records, shortDate, type SampleRecord } from "./data";
import { CompanyMark, PhaseBar, RoundLadder, Waiting, methodIcon } from "./marks";

const filters = ["Active", "Interviewing", "Waiting on them", "Closed", "All"] as const;
type Filter = (typeof filters)[number];

function matches(record: SampleRecord, filter: Filter, query: string) {
  const text = `${record.company} ${record.role} ${record.contact ?? ""}`.toLowerCase();
  if (query && !text.includes(query.toLowerCase())) return false;
  if (filter === "All") return true;
  if (filter === "Closed") return record.phase === "Closed";
  if (filter === "Interviewing")
    return record.phase === "Interviewing" || record.phase === "Decision";
  if (filter === "Waiting on them")
    return record.phase === "Applied" && !(record.method !== "DIRECT" && record.lastHeardAt);
  return record.phase !== "Closed";
}

function useLedger() {
  const [filter, setFilter] = useState<Filter>("Active");
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = records.filter((record) => matches(record, filter, query));
  return { filter, setFilter, query, setQuery, rows, hovered, setHovered };
}

function Toolbar({
  filter,
  setFilter,
  query,
  setQuery,
}: Pick<ReturnType<typeof useLedger>, "filter" | "setFilter" | "query" | "setQuery">) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Filter records" className="flex flex-wrap gap-1.5">
        {filters.map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={filter === name}
            onClick={() => setFilter(name)}
            className={cn(
              "pressable inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm",
              filter === name
                ? "border-transparent bg-selected text-selected-foreground"
                : "border-border bg-transparent text-foreground hover:bg-muted",
            )}
          >
            {name}
            <span className="text-xs opacity-70 tabular-nums">
              {records.filter((record) => matches(record, name, "")).length}
            </span>
          </button>
        ))}
      </div>
      <label className="relative ml-auto w-full font-normal sm:w-56">
        <span className="sr-only">Search records</span>
        <Search
          size={15}
          aria-hidden
          className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Company, role or person"
          className="!min-h-9 !rounded-full !py-1.5 !pl-9"
        />
      </label>
    </div>
  );
}

function LinkedChip({
  record,
  onHover,
}: {
  record: SampleRecord;
  onHover: (id: string | null) => void;
}) {
  if (!record.linkedTo) return null;
  const other = records.find((row) => row.id === record.linkedTo)!;
  return (
    <span
      onMouseEnter={() => onHover(other.id)}
      onMouseLeave={() => onHover(null)}
      className="inline-flex cursor-default items-center gap-1 rounded-full bg-selected px-2 py-0.5 text-xs text-selected-foreground"
    >
      <Link2 size={11} aria-hidden />
      {other.method === "DIRECT" ? "Application" : methodLabel[other.method]}
    </span>
  );
}

function Empty() {
  return (
    <p className="m-0 rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
      No records match. Clear the search or pick another filter.
    </p>
  );
}

/* ───────── A · Rows with a phase bar ───────── */

export function LedgerPhaseRows() {
  const state = useLedger();
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-5 sm:p-6">
      <Toolbar {...state} />
      <ul className="m-0 list-none divide-y divide-border p-0">
        {state.rows.map((record) => {
          const Icon = methodIcon[record.method];
          return (
            <li
              key={record.id}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-2xl px-3 py-4 transition-colors sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_6.5rem]",
                state.hovered === record.id && "bg-selected/50",
              )}
            >
              <CompanyMark company={record.company} />
              <div className="min-w-0">
                <p className="m-0 flex flex-wrap items-center gap-2 font-semibold">
                  {record.company}
                  <LinkedChip record={record} onHover={state.setHovered} />
                </p>
                <p className="m-0 truncate text-sm text-muted-foreground">{record.role}</p>
                <p className="m-0 mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon size={12} aria-hidden />
                  {methodLabel[record.method]}
                  {record.contact && ` · ${record.contact}`}
                  {record.sentAt && ` · ${shortDate(record.sentAt)}`}
                </p>
              </div>
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <PhaseBar record={record} />
                <p className="m-0 mt-1 truncate text-sm">{record.latest}</p>
              </div>
              <div className="col-span-2 flex items-start sm:col-span-1 sm:justify-end">
                <Waiting record={record} />
              </div>
            </li>
          );
        })}
      </ul>
      {!state.rows.length && <Empty />}
    </div>
  );
}

/* ───────── B · Round ladder, linked records nested ───────── */

export function LedgerLadder() {
  const state = useLedger();
  const shown = new Set(state.rows.map((row) => row.id));
  // A linked outreach row sits directly under its application, joined by a rail.
  const parents = state.rows.filter(
    (row) => !(row.linkedTo && row.method !== "DIRECT" && shown.has(row.linkedTo)),
  );
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-5 sm:p-6">
      <Toolbar {...state} />
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 text-xs text-muted-foreground sm:grid">
        <span>Opening</span>
        <span>Rounds</span>
        <span>Latest</span>
      </div>
      <ul className="m-0 list-none space-y-2 p-0">
        {parents.map((record) => {
          const child = state.rows.find(
            (row) => row.linkedTo === record.id && row.method !== "DIRECT",
          );
          return (
            <li key={record.id} className="rounded-2xl bg-background/60 ring-1 ring-border">
              <LadderRow record={record} />
              {child && (
                <div className="relative ml-9 border-l-2 border-dashed border-border pl-0">
                  <LadderRow record={child} nested />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!state.rows.length && <Empty />}
    </div>
  );
}

function LadderRow({ record, nested = false }: { record: SampleRecord; nested?: boolean }) {
  const Icon = methodIcon[record.method];
  const last = record.lastHeardAt ?? record.sentAt;
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4",
        nested && "py-3",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {nested ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <Icon size={14} aria-hidden />
          </span>
        ) : (
          <CompanyMark company={record.company} size="sm" />
        )}
        <div className="min-w-0">
          <p className="m-0 truncate font-medium">
            {nested ? `${methodLabel[record.method]} · ${record.contact}` : record.company}
          </p>
          <p className="m-0 truncate text-sm text-muted-foreground">
            {nested ? record.latest : record.role}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {record.method === "DIRECT" ? (
          record.phase === "Preparing" ? (
            <span className="text-xs text-muted-foreground">Not sent yet</span>
          ) : (
            <RoundLadder record={record} />
          )
        ) : (
          <Waiting record={record} />
        )}
        {record.method === "DIRECT" && <Waiting record={record} />}
      </div>
      {!nested && (
        <div className="min-w-0">
          <p
            className={cn(
              "m-0 truncate text-sm",
              record.phase === "Closed" && "text-destructive",
              record.phase === "Decision" && "font-medium text-success",
            )}
          >
            {record.latest}
          </p>
          {last && (
            <p className="m-0 text-xs text-muted-foreground tabular-nums">
              {daysSince(last) === 0 ? "Today" : `${daysSince(last)}d ago`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────── C · Grouped by phase ───────── */

export function LedgerByPhase() {
  const state = useLedger();
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-5 sm:p-6">
      <Toolbar {...state} />
      {phases.map((phase) => {
        const rows = state.rows.filter((row) => row.phase === phase);
        if (!rows.length) return null;
        return (
          <section key={phase} className="space-y-2">
            <h4 className="m-0 text-sm font-semibold">
              {phase}{" "}
              <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((record) => {
                const Icon = methodIcon[record.method];
                return (
                  <article
                    key={record.id}
                    onMouseEnter={() => record.linkedTo && state.setHovered(record.linkedTo)}
                    onMouseLeave={() => state.setHovered(null)}
                    className={cn(
                      "pressable rounded-2xl bg-background/60 p-4 ring-1 ring-border transition-shadow hover:ring-primary",
                      state.hovered === record.id && "ring-2 ring-primary",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="m-0 truncate font-semibold">{record.company}</p>
                        <p className="m-0 truncate text-sm text-muted-foreground">{record.role}</p>
                      </div>
                      <Waiting record={record} />
                    </div>
                    <p className="m-0 mt-3 text-sm">{record.latest}</p>
                    <p className="m-0 mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon size={12} aria-hidden />
                      {methodLabel[record.method]}
                      {record.linkedTo && (
                        <span className="inline-flex items-center gap-1 text-link">
                          <Link2 size={11} aria-hidden />
                          linked
                        </span>
                      )}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      {!state.rows.length && <Empty />}
    </div>
  );
}
