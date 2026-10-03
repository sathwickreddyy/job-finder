import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { istDaysBetween } from "../dates";
import { filterLabel, matchesFilter, recordFilters, type RecordFilter } from "../navigation";
import { isOutreach, methodLabel, phaseOf, phaseText, recordStateFrom } from "../phase";
import { silenceClock } from "../queue";
import type { ApplicationRecord } from "../read";
import { CompanyMark, MethodIcon, QuietChip, RoundLadder } from "./marks";

export function RecordsView({
  records,
  filter,
  q,
  now,
}: {
  records: ApplicationRecord[];
  filter: RecordFilter;
  q: string;
  now: Date;
}) {
  const shown = records.filter((record) => matchesFilter(record, filter, q, now));
  const byId = new Map(shown.map((record) => [record.id, record]));
  // Outreach for an opening sits under that opening's direct application.
  const parentOf = new Map<string, string>();
  for (const record of shown)
    if (isOutreach(record.source)) {
      const direct = record.linkedIds.find(
        (id) => byId.has(id) && !isOutreach(byId.get(id)!.source),
      );
      if (direct) parentOf.set(record.id, direct);
    }
  const parents = shown.filter((record) => !parentOf.has(record.id));
  const link = (name: RecordFilter) =>
    `/applications?tab=records&filter=${name}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <div className="min-w-0 space-y-4 rounded-panel border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter records" className="flex flex-wrap gap-1.5">
          {recordFilters.map((name) => (
            <Link
              key={name}
              href={link(name)}
              aria-current={filter === name ? "page" : undefined}
              className={cn(
                "pressable inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm hover:no-underline",
                filter === name
                  ? "border-transparent bg-selected text-selected-foreground"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {filterLabel[name]}
              <span className="text-xs opacity-70 tabular-nums">
                {records.filter((record) => matchesFilter(record, name, "", now)).length}
              </span>
            </Link>
          ))}
        </nav>
        <form role="search" action="/applications" className="relative w-full sm:ml-auto sm:w-56">
          <input type="hidden" name="tab" value="records" />
          <input type="hidden" name="filter" value={filter} />
          <label htmlFor="records-q" className="sr-only">
            Search records
          </label>
          <Search
            size={15}
            aria-hidden
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="records-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Company, role or person"
            className="!min-h-9 !rounded-full !py-1.5 !pl-9"
          />
        </form>
      </div>
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 text-xs text-muted-foreground sm:grid">
        <span>Opening</span>
        <span>Rounds</span>
        <span>Latest</span>
      </div>
      {parents.length ? (
        <ul className="m-0 list-none space-y-2 p-0">
          {parents.map((record) => {
            const children = shown.filter((other) => parentOf.get(other.id) === record.id);
            return (
              <li key={record.id} className="rounded-2xl bg-background/60 ring-1 ring-border">
                <RecordRow record={record} now={now} />
                {children.map((child) => (
                  <div key={child.id} className="ml-9 border-l-2 border-dashed border-border">
                    <RecordRow record={child} now={now} nested />
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          {records.length
            ? "No records match. Clear the search or pick another filter."
            : "No applications yet. Find an opening, then record what you sent."}
        </p>
      )}
    </div>
  );
}

function RecordRow({
  record,
  now,
  nested = false,
}: {
  record: ApplicationRecord;
  now: Date;
  nested?: boolean;
}) {
  const state = recordStateFrom(record, record.rounds, []);
  const phase = phaseOf(state);
  const clock = silenceClock(record, now);
  const last = record.latest?.at ?? record.sentAt;
  const ago = last ? istDaysBetween(last, now) : null;
  const method = `${methodLabel[record.source] ?? "Applied directly"}${record.contact ? ` · ${record.contact}` : ""}`;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {nested ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <MethodIcon source={record.source} size={14} />
          </span>
        ) : (
          <CompanyMark company={record.company} size="sm" />
        )}
        <div className="min-w-0">
          <Link
            href={`/applications/${record.id}`}
            className="block truncate font-medium text-foreground"
            title={nested ? method : `${record.company} · ${record.role}`}
          >
            {nested ? method : record.company}
          </Link>
          <p className="m-0 truncate text-sm text-muted-foreground">{record.role}</p>
          {!nested && (
            <p className="m-0 mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <MethodIcon source={record.source} />
              <span className="min-w-0 [overflow-wrap:anywhere]">{method}</span>
            </p>
          )}
          {record.resume && !nested && (
            <Link
              href={`/api/resumes/${record.resume.id}/file?download=1`}
              className="mt-1 block truncate text-xs text-link"
              title={`Resume: ${record.resume.filename}`}
            >
              {record.resume.filename}
            </Link>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {!isOutreach(record.source) &&
          (phase === "Preparing" ? (
            <span className="text-xs text-muted-foreground">Not sent yet</span>
          ) : (
            <RoundLadder rounds={record.rounds} typical={record.typicalRounds} />
          ))}
        <QuietChip clock={clock} />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "m-0 truncate text-sm",
            phase === "Closed" && record.closedReason !== "ACCEPTED" && "text-destructive",
            (phase === "Decision" || record.closedReason === "ACCEPTED") &&
              "font-medium text-success",
          )}
        >
          {record.latest?.summary ??
            phaseText({
              phase,
              source: record.source,
              replied: state.replied,
              closedReason: record.closedReason,
              status: record.status,
              rounds: record.rounds.length,
              typical: record.typicalRounds,
            })}
        </p>
        {ago !== null && (
          <p className="m-0 text-xs text-muted-foreground tabular-nums">
            {ago === 0 ? "Today" : `${ago}d ago`}
          </p>
        )}
      </div>
    </div>
  );
}
