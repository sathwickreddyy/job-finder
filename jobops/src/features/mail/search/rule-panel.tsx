"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Search } from "lucide-react";
import { formatDay } from "@/features/applications/dates";
import type { readCompanySearch, SearchLane } from "@/features/mail/company-search";
import type { IngestItem } from "@/features/mail/ingest";
import { cn } from "@/lib/utils";
import { includeDroppedMail, saveCompanyRule, searchCompanyMail } from "../workspace-actions";
import { Chips, type RuleField } from "./chips";
import { RunLanes, type Included } from "./run-lanes";

type SearchData = Awaited<ReturnType<typeof readCompanySearch>>;
type Rule = Omit<SearchData["rule"], "company">;
const DAY = 86_400_000;
const CAP = 3650;

function lastSearchText(run: NonNullable<SearchData["lastRun"]>) {
  const days = Math.round((Date.parse(run.until) - Date.parse(run.since)) / DAY);
  return `Last search ${formatDay(new Date(run.startedAt))}, last ${days} days: ${run.counts.kept} kept, ${run.counts.dropped} dropped`;
}
const add = (total: SearchLane["counts"], page: SearchLane["counts"]) => ({
  fetched: total.fetched + page.fetched,
  alreadyHere: total.alreadyHere + page.alreadyHere,
  kept: total.kept + page.kept,
  dropped: total.dropped + page.dropped,
  newAttention: total.newAttention + page.newAttention,
});

/**
 * Gallery search panel C: how the company's mail is found, one rule per row with what the
 * last search found by it. Every edit saves at once; the search runs one lane per inbox.
 */
export function RulePanel({
  data,
  companyKey,
  companyName,
}: {
  data: SearchData;
  companyKey: string;
  companyName: string;
}) {
  const router = useRouter();
  const [rule, setRule] = useState<Rule>(() => ({
    aliases: data.rule.aliases,
    domains: data.rule.domains,
    senders: data.rule.senders,
    keywords: data.rule.keywords,
    excludedTerms: data.rule.excludedTerms,
  }));
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [chosen, setChosen] = useState(() => new Set(data.inboxes.map((row) => row.account)));
  const [frame, setFrame] = useState<"since" | "days">(data.lastRun ? "since" : "days");
  const [days, setDays] = useState(90);
  const [lanes, setLanes] = useState<SearchLane[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, Included | "pending" | { error: string }>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [running, startRun] = useTransition();
  const hits = data.ruleHits;

  function save(next: Rule) {
    const previous = rule;
    setRule(next);
    startSaving(async () => {
      const result = await saveCompanyRule(companyKey, next);
      if (result.error) {
        setRule(previous);
        setSaved(result.error);
      } else {
        setSaved("Saved. Fetches and searches use it from now on.");
        router.refresh();
      }
    });
  }
  const change = (field: keyof Rule) => (values: string[]) => save({ ...rule, [field]: values });

  function run() {
    setSummary(null);
    setNotes({});
    startRun(async () => {
      const merged = new Map<string, SearchLane>();
      const read: Record<string, number> = {};
      let error: string | undefined;
      let more = false;
      for (let call = 0; call < 20; call++) {
        const step = await searchCompanyMail(
          companyKey,
          call === 0
            ? {
                restart: true,
                accounts: [...chosen],
                ...(frame === "days" ? { lastDays: days } : {}),
              }
            : {},
        );
        if (step.error || !step.search) {
          error = step.error ?? "The search stopped. Found mail is saved; search again.";
          break;
        }
        for (const lane of step.search.lanes) {
          const before = merged.get(lane.account);
          if (lane.counts.fetched || lane.state === "done")
            read[lane.account] = (read[lane.account] ?? 0) + 1;
          merged.set(lane.account, {
            ...lane,
            counts: before ? add(before.counts, lane.counts) : lane.counts,
            items: [...lane.items, ...(before?.items ?? [])].sort((a, b) =>
              b.receivedAt.localeCompare(a.receivedAt),
            ),
          });
        }
        setLanes([...merged.values()]);
        setPages({ ...read });
        more = step.search.more;
        if (!more) break;
      }
      const all = [...merged.values()];
      const kept = all.reduce((sum, lane) => sum + lane.counts.kept, 0);
      const dropped = all.reduce((sum, lane) => sum + lane.counts.dropped, 0);
      const failed = all.filter((lane) => lane.state === "failed").map((lane) => lane.account);
      setSummary(
        error ??
          [
            `Finished. ${kept} kept for ${companyName}, ${dropped} dropped with a reason each.`,
            more ? "More mail remains; search again to continue." : "",
            failed.length
              ? `${failed.join(", ")} ${failed.length === 1 ? "needs" : "need"} reconnecting in Inboxes before ${failed.length === 1 ? "it" : "they"} can be searched.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
      );
      router.refresh();
    });
  }

  function include(item: IngestItem) {
    setNotes((current) => ({ ...current, [item.trackingId]: "pending" }));
    void includeDroppedMail(item.trackingId, companyKey).then((result) => {
      setNotes((current) => ({
        ...current,
        [item.trackingId]:
          result.error || !result.included
            ? { error: result.error ?? "Include this failed. Retry." }
            : { company: companyName, result: result.included, keywordAdded: false },
      }));
      if (result.included?.addedSender)
        setRule((current) => ({
          ...current,
          senders: [...current.senders, result.included!.addedSender!],
        }));
      router.refresh();
    });
  }
  function addKeyword(item: IngestItem) {
    const note = notes[item.trackingId];
    if (!note || typeof note !== "object" || !("result" in note)) return;
    const keyword = note.result.suggestedKeyword;
    if (!keyword) return;
    save({ ...rule, keywords: [...rule.keywords, keyword] });
    setNotes((current) => ({ ...current, [item.trackingId]: { ...note, keywordAdded: true } }));
  }

  const rows: {
    field: RuleField;
    key: keyof Rule;
    title: string;
    found: string | null;
    fixed?: string[];
  }[] = [
    {
      field: "senders",
      key: "senders",
      title: "Addresses",
      found: hits ? `${hits.addresses} kept` : null,
    },
    {
      field: "domains",
      key: "domains",
      title: "Domains",
      found: hits ? `${hits.domains} kept` : null,
    },
    {
      field: "keywords",
      key: "keywords",
      title: "Names and keywords",
      found: hits ? `${hits.keywords} kept` : null,
      fixed: [companyName],
    },
    {
      field: "excludedTerms",
      key: "excludedTerms",
      title: "Never include",
      found: hits ? `${hits.never} left out` : null,
    },
  ];
  return (
    <section
      id="mail-search"
      aria-labelledby="mail-search-title"
      className="scroll-mt-24 space-y-4 rounded-3xl bg-card p-4 ring-1 ring-border sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mail-search-title" className="m-0 text-base font-semibold">
          How we find {companyName}&apos;s mail
        </h2>
        <span className="text-xs text-muted-foreground">
          {data.lastRun ? lastSearchText(data.lastRun) : "Not searched yet"}
        </span>
      </div>
      <dl className="m-0 divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={row.field}
            className="grid gap-2 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_5.5rem] sm:items-start"
          >
            <dt className="pt-1.5 text-sm font-medium">{row.title}</dt>
            <dd className="m-0 min-w-0">
              {row.field === "keywords" ? (
                <span className="inline-flex flex-wrap items-start gap-1.5">
                  <Chips
                    field="keywords"
                    values={rule.aliases}
                    fixed={row.fixed}
                    company={companyName}
                    onChange={change("aliases")}
                    addable={false}
                  />
                  <Chips
                    field="keywords"
                    values={rule.keywords}
                    company={companyName}
                    onChange={change("keywords")}
                  />
                </span>
              ) : (
                <Chips
                  field={row.field}
                  values={rule[row.key]}
                  company={companyName}
                  onChange={change(row.key)}
                />
              )}
            </dd>
            <dd className="m-0 pt-1.5 text-xs text-muted-foreground sm:text-right">{row.found}</dd>
          </div>
        ))}
        <div className="grid gap-2 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="pt-1.5 text-sm font-medium">Inboxes</dt>
          <dd className="m-0 inline-flex flex-wrap gap-1.5">
            {data.inboxes.map((inbox) => {
              const on = chosen.has(inbox.account);
              return (
                <label
                  key={inbox.account}
                  className={cn(
                    "inline-flex h-8 max-w-full cursor-pointer items-center gap-2 rounded-full px-3 text-sm ring-1 ring-inset",
                    on
                      ? "bg-selected text-selected-foreground ring-transparent"
                      : "text-muted-foreground ring-border",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(chosen);
                      if (on) next.delete(inbox.account);
                      else next.add(inbox.account);
                      setChosen(next);
                    }}
                    className="sr-only"
                  />
                  {on && <Check aria-hidden size={14} />}
                  <span className="truncate">{inbox.account}</span>
                </label>
              );
            })}
            <span className="w-full text-xs text-muted-foreground">
              All folders including Spam, Junk and Trash; sent mail and drafts are left out.
            </span>
          </dd>
        </div>
        <div className="grid gap-2 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="pt-1.5 text-sm font-medium">Time frame</dt>
          <dd className="m-0">
            <span
              role="radiogroup"
              aria-label="Time frame"
              className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1"
            >
              {data.lastRun && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={frame === "since"}
                  onClick={() => setFrame("since")}
                  className={cn(
                    "h-8 rounded-full px-3 text-sm",
                    frame === "since" ? "bg-card shadow-surface" : "text-muted-foreground",
                  )}
                >
                  Since last search, {formatDay(new Date(data.lastRun.until))}
                </button>
              )}
              <span
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full pr-3 pl-1 text-sm",
                  frame === "days" ? "bg-card shadow-surface" : "text-muted-foreground",
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={frame === "days"}
                  onClick={() => setFrame("days")}
                  className="h-8 rounded-full pl-2"
                >
                  Last
                </button>
                <input
                  type="number"
                  min={1}
                  max={CAP}
                  aria-label="Number of days"
                  value={days}
                  onFocus={() => setFrame("days")}
                  onChange={(event) =>
                    setDays(Math.min(CAP, Math.max(1, Math.round(Number(event.target.value) || 1))))
                  }
                  className="h-7! min-h-7! w-18! rounded-full! px-2! py-0! text-center text-sm"
                />
                days
              </span>
            </span>
          </dd>
        </div>
      </dl>
      <details className="rounded-2xl bg-muted/40 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Show the exact search sent to each inbox
        </summary>
        <div className="mt-2 space-y-2">
          {data.inboxes
            .filter((inbox) => chosen.has(inbox.account))
            .map((inbox) => (
              <div key={inbox.account}>
                <p className="m-0 text-xs font-medium">{inbox.account}</p>
                <code className="block rounded-lg bg-background px-2 py-1.5 font-mono text-xs break-all text-muted-foreground">
                  {data.queries[inbox.account]}
                </code>
              </div>
            ))}
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running || !chosen.size}
          onClick={run}
          className="morph pressable inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {running ? (
            <Loader2 aria-hidden size={15} className="animate-spin motion-reduce:animate-none" />
          ) : lanes.length ? (
            <RotateCcw aria-hidden size={15} />
          ) : (
            <Search aria-hidden size={15} />
          )}
          {running ? "Searching…" : `Search ${companyName}'s mail`}
        </button>
        <span role="status" className="text-xs text-muted-foreground">
          {saving ? (
            "Saving…"
          ) : saved ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                saved.startsWith("Saved") ? "" : "text-destructive",
              )}
            >
              {saved.startsWith("Saved") && (
                <Check aria-hidden size={13} className="text-success" />
              )}
              {saved}
            </span>
          ) : (
            data.ruleSource
          )}
        </span>
      </div>
      {lanes.length > 0 && (
        <RunLanes
          lanes={lanes}
          pages={pages}
          notes={notes}
          onInclude={include}
          onAddKeyword={addKeyword}
        />
      )}
      {summary && (
        <p role="status" className="m-0 rounded-2xl bg-muted/50 px-3 py-2 text-sm">
          {summary}
        </p>
      )}
    </section>
  );
}
