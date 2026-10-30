"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanyRuleEditor } from "./company-rule-editor";
import type { CompanyMailRule } from "./search-policy";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Pause, Play, Mail, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { mailSearchSchema, resolveMailSearch, type ResolvedMailSearch } from "./search-contract";
import {
  allSearchMessages,
  mergeSearchPage,
  newAccountRun,
  type AccountRun,
  type SearchAccount,
  type SearchResponse,
  type SavedCompanyMail,
} from "./search-state";
import { demoMailSearch } from "./search-preview";

type Company = { id: string; name: string; aliases: string[]; rule?: CompanyMailRule };
const split = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
const statuses = {
  waiting: "Waiting",
  requesting: "Requesting mail…",
  paused: "Paused · more pages",
  complete: "Complete",
  failed: "Needs attention",
  limited: "Provider limit · incomplete",
};
const pagesPerPass = 10;
async function fetchSearch(body: unknown, company = false): Promise<SearchResponse> {
  const response = await fetch(company ? "/api/v1/mail/company/search" : "/api/v1/mail/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => {
    throw new Error("Search response could not be read. Retry to continue.");
  });
  if (!response.ok) throw new Error(data.error ?? "Search request failed. Retry to continue.");
  return data as SearchResponse;
}
export function MailSearchWorkspace({
  accounts,
  companies,
  initialCompany = "",
  initialAccount,
  contextLabel,
  backHref = "/mail",
  preview = false,
  initialSaved,
}: {
  accounts: SearchAccount[];
  companies: Company[];
  initialCompany?: string;
  initialAccount?: string;
  contextLabel?: string;
  backHref?: string;
  preview?: boolean;
  initialSaved?: SavedCompanyMail;
}) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany);
  const initial = companies.find((c) => c.id === initialCompany);
  const [keywords, setKeywords] = useState(
    initial && preview ? [initial.name, ...initial.aliases].slice(0, 10).join(", ") : "",
  );
  const [senders, setSenders] = useState("");
  const [subjects, setSubjects] = useState("");
  const [duration, setDuration] = useState("days");
  const [days, setDays] = useState("7");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState(
    accounts.filter((a) => !initialAccount || a.email === initialAccount).map((a) => a.id),
  );
  const companyMode = Boolean(initial?.rule && !preview);
  const [savingRules, setSavingRules] = useState(false);
  const [savedView, setSavedView] = useState<"kept" | "excluded">("kept");
  const [savedMail, setSavedMail] = useState<SavedCompanyMail>(
    initialSaved ?? { messages: [], counts: { kept: 0, excluded: 0 }, nextBefore: null },
  );
  const [loadingSaved, setLoadingSaved] = useState(false);
  const frozenCompany = useRef<string | null>(null);
  const frozenMode = useRef("latest");
  const [runs, setRuns] = useState<AccountRun[]>([]);
  const [window, setWindow] = useState<ResolvedMailSearch | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [reading, setReading] = useState(false);
  const [resultAccount, setResultAccount] = useState("");
  const [resultPage, setResultPage] = useState(0);
  const runMap = useRef<Record<string, AccountRun>>({});
  const frozen = useRef<ResolvedMailSearch | null>(null);
  const stop = useRef(false);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, []);
  const publish = () => {
    if (mounted.current) setRuns(Object.values(runMap.current));
  };
  const runMessages = allSearchMessages(runs);
  const messages = companyMode
    ? [
        ...new Map(
          [...savedMail.messages, ...(savedView === "kept" ? runMessages : [])].map((m) => [
            m.identity,
            m,
          ]),
        ).values(),
      ].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    : runMessages;
  async function loadSaved(view: "kept" | "excluded" = savedView, older = false) {
    if (!companyMode) return;
    setLoadingSaved(true);
    try {
      const query = new URLSearchParams({
        company: initialCompany,
        view,
        ...(older && savedMail.nextBefore ? { before: savedMail.nextBefore } : {}),
      });
      const response = await fetch(`/api/v1/mail/company/search?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Saved company mail could not be loaded.");
      const data: SavedCompanyMail = await response.json();
      setSavedMail((previous) => ({
        ...data,
        messages: older ? [...previous.messages, ...data.messages] : data.messages,
      }));
      setSavedView(view);
      setResultPage(0);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Saved mail could not be loaded.");
    } finally {
      setLoadingSaved(false);
    }
  }
  const filtered = resultAccount ? messages.filter((m) => m.account === resultAccount) : messages;
  const shown = filtered.slice(resultPage * 50, (resultPage + 1) * 50);
  const message = messages.find((m) => m.identity === selected);
  const resumable = runs.some((r) => r.status === "paused" || r.status === "failed");
  const complete = runs.length > 0 && runs.every((r) => r.status === "complete");

  async function execute(ids: string[]) {
    if (active.current || !frozen.current) return;
    active.current = true;
    stop.current = false;
    setBusy(true);
    setPausing(false);
    setError("");
    await Promise.all(
      ids.map(async (id) => {
        for (let page = 0; page < pagesPerPass && !stop.current; page++) {
          let run = runMap.current[id];
          if (run.status === "complete" || run.status === "limited") break;
          runMap.current[id] = { ...run, status: "requesting", error: null };
          publish();
          try {
            const companyRequest = Boolean(frozenCompany.current);
            const body = run.cursor
              ? companyRequest
                ? { companyCursor: run.cursor }
                : { cursor: run.cursor }
              : companyRequest
                ? {
                    company: frozenCompany.current,
                    mode: frozenMode.current,
                    since: frozen.current?.since,
                    until: frozen.current?.until,
                    accounts: [run.account.email],
                  }
                : { ...frozen.current, accounts: [run.account.email] };
            const response = await (preview
              ? demoMailSearch(body)
              : fetchSearch(body, companyRequest));
            run = mergeSearchPage(run, response);
            runMap.current[id] = run;
            publish();
            if (run.status !== "paused") break;
          } catch (failure) {
            const detail =
              failure instanceof Error
                ? failure.message
                : "Connection interrupted. Retry to continue.";
            runMap.current[id] = {
              ...run,
              status: "failed",
              error: detail,
              events: [
                ...run.events,
                { page: run.pages + 1, time: new Date().toISOString(), detail },
              ],
            };
            publish();
            break;
          }
        }
      }),
    );
    active.current = false;
    if (mounted.current && frozenCompany.current) await loadSaved();
    if (mounted.current) {
      setBusy(false);
      setPausing(false);
    }
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    try {
      const input = mailSearchSchema.parse({
        keywords: split(keywords),
        senders: split(senders),
        subjects: split(subjects),
        ...(duration === "days" ? { lastDays: Number(days) } : {}),
        ...(duration === "dates"
          ? {
              since: new Date(`${since}+05:30`).toISOString(),
              ...(until ? { until: new Date(`${until}+05:30`).toISOString() } : {}),
            }
          : {}),
      });
      const resolved = resolveMailSearch(input);
      mailSearchSchema.parse(resolved);
      const chosen = accounts.filter((a) => selectedAccounts.includes(a.id));
      if (!chosen.length) throw new Error("Select at least one connected account.");
      if (chosen.length > 10) throw new Error("Select at most 10 accounts per search.");
      frozenCompany.current = companyMode ? initialCompany : null;
      frozenMode.current = duration === "all" ? "history" : "latest";
      frozen.current = resolved;
      setWindow(resolved);
      setCriteriaOpen(false);
      setSelected("");
      setReading(false);
      setResultPage(0);
      setResultAccount("");
      runMap.current = Object.fromEntries(chosen.map((a) => [a.id, newAccountRun(a)]));
      publish();
      void execute(chosen.map((a) => a.id));
    } catch (failure) {
      setError(
        failure instanceof Error && "issues" in failure
          ? "Check the criteria: use valid addresses, literal phrases and a valid date window."
          : failure instanceof Error
            ? failure.message
            : "Check the search criteria.",
      );
    }
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-link">
            <ArrowLeft size={14} />
            Back to {contextLabel ? "application" : "mail"}
          </Link>
          <h1 className="mb-1 mt-3 text-2xl font-semibold tracking-tight">Search inboxes</h1>
          <p className="m-0 text-sm text-muted-foreground">
            {contextLabel ?? "Choose what to search. Watch each account return real messages."}
          </p>
        </div>
        <Link href="/mail" className="text-sm text-link">
          Saved mail workspace
        </Link>
      </header>
      {preview && (
        <p role="note" className="rounded-xl bg-review px-4 py-3 text-sm text-review-foreground">
          Gallery preview · sample accounts and messages. No inboxes are contacted.
        </p>
      )}
      {companyMode && initial?.rule && (
        <CompanyRuleEditor
          key={JSON.stringify(initial.rule)}
          company={initialCompany}
          rule={initial.rule}
          disabled={busy}
          onPending={setSavingRules}
          onSaved={() => {
            setRuns([]);
            runMap.current = {};
            setWindow(null);
            setCriteriaOpen(true);
            frozen.current = null;
            void loadSaved();
            router.refresh();
          }}
        />
      )}
      <form onSubmit={search} className="rounded-2xl border border-border bg-card p-5">
        {window && (
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <p className="m-0 max-w-3xl break-words text-xs text-muted-foreground">
              Current search:{" "}
              {companyMode
                ? `saved ${initial?.name} sender / subject rules`
                : window.keywords.length
                  ? `keywords ${window.keywords.join(" or ")}`
                  : "all incoming mail"}
              {window.senders.length ? ` · from ${window.senders.join(" or ")}` : ""}
              {window.subjects.length ? ` · subjects ${window.subjects.join(" or ")}` : ""} ·{" "}
              {runs.length} accounts
            </p>
            <button
              type="button"
              className="shrink-0 text-xs text-link"
              aria-expanded={criteriaOpen}
              onClick={() => setCriteriaOpen((value) => !value)}
            >
              {criteriaOpen ? "Hide criteria" : "Show / edit criteria"}
            </button>
          </div>
        )}
        <fieldset
          disabled={busy || savingRules}
          className={cn("min-w-0 space-y-4", !criteriaOpen && "hidden")}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="text-xs font-medium">
              Company preset
              <select
                className="mt-1.5"
                value={company}
                onChange={(event) => {
                  if (!preview) {
                    router.push(
                      event.target.value
                        ? `/mail/search?company=${encodeURIComponent(event.target.value)}`
                        : "/mail/search",
                    );
                    return;
                  }
                  setCompany(event.target.value);
                  const chosen = companies.find((c) => c.id === event.target.value);
                  setKeywords(
                    chosen ? [chosen.name, ...chosen.aliases].slice(0, 10).join(", ") : "",
                  );
                }}
              >
                <option value="">Any company / all incoming mail</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!companyMode && (
              <>
                <label className="text-xs font-medium">
                  Keywords or phrases
                  <input
                    className="mt-1.5"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="Amazon, Amazon Jobs — leave blank for all mail"
                  />
                </label>
                <label className="text-xs font-medium">
                  From addresses
                  <input
                    className="mt-1.5"
                    value={senders}
                    onChange={(e) => setSenders(e.target.value)}
                    placeholder="recruiter@company.com"
                  />
                </label>
                <label className="text-xs font-medium">
                  Subject phrases
                  <input
                    className="mt-1.5"
                    value={subjects}
                    onChange={(e) => setSubjects(e.target.value)}
                    placeholder="interview, application"
                  />
                </label>
              </>
            )}
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            {companyMode
              ? "Uses the company rules above. Matching job-search mail is saved permanently; exclusions are recorded separately. Checks reuse completed coverage, with a one-hour overlap for delayed mail."
              : "Separate alternatives with commas. Any alternative within a field; all populated fields must match. General keyword searches are temporary."}
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs font-medium">
              Date window
              <select
                className="mt-1.5"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                <option value="days">Last N days</option>
                <option value="dates">Exact dates · India time</option>
                <option value="all">All available history</option>
              </select>
            </label>
            {duration === "days" && (
              <label className="w-28 text-xs font-medium">
                Number of days
                <input
                  className="mt-1.5"
                  type="number"
                  min="1"
                  max="3650"
                  required
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </label>
            )}
            {duration === "dates" && (
              <>
                <label className="min-w-0 text-xs font-medium">
                  From · IST
                  <input
                    className="mt-1.5"
                    type="datetime-local"
                    required
                    value={since}
                    onChange={(e) => setSince(e.target.value)}
                  />
                </label>
                <label className="min-w-0 text-xs font-medium">
                  Until · IST (blank = now)
                  <input
                    className="mt-1.5"
                    type="datetime-local"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </label>
              </>
            )}
            <span className="pb-2 text-xs text-muted-foreground">
              {duration === "days"
                ? `${days || "N"} × 24 hours, ending when you start.`
                : duration === "all"
                  ? "No lower date cutoff."
                  : "Start included; end excluded."}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
            <span className="text-xs font-medium">Accounts</span>
            {accounts.map((a) => (
              <label key={a.id} className="flex min-w-0 items-center gap-2 text-xs">
                <input
                  className="!w-4"
                  type="checkbox"
                  checked={selectedAccounts.includes(a.id)}
                  onChange={(e) =>
                    setSelectedAccounts((previous) =>
                      e.target.checked ? [...previous, a.id] : previous.filter((id) => id !== a.id),
                    )
                  }
                />
                <span className="break-all">{a.email}</span>
              </label>
            ))}
            {!accounts.length && (
              <Link href="/settings" className="text-sm text-link">
                Connect an inbox in Settings
              </Link>
            )}
          </div>
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || savingRules || !selectedAccounts.length}>
            <Search size={16} />
            {companyMode
              ? duration === "all"
                ? "Recover older company mail"
                : "Check company mail"
              : runs.length
                ? "Start new search"
                : "Search inboxes"}
          </Button>
          {busy ? (
            <Button
              type="button"
              variant="outline"
              disabled={pausing}
              onClick={() => {
                stop.current = true;
                setPausing(true);
              }}
            >
              <Pause size={15} />
              {pausing ? "Finishing current pages…" : "Pause after current pages"}
            </Button>
          ) : (
            resumable && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void execute(
                    runs
                      .filter((r) => r.status === "paused" || r.status === "failed")
                      .map((r) => r.account.id),
                  )
                }
              >
                <Play size={15} />
                Continue / retry unfinished accounts
              </Button>
            )
          )}
          <span className="text-xs text-muted-foreground">
            {companyMode
              ? "Company matches are saved permanently. Application outcomes stay manual."
              : "Read-only search · results are not saved to tracking."}
          </span>
        </div>
        {window && !busy && (
          <p className="mb-0 text-xs text-muted-foreground">
            {companyMode
              ? "Saved company mail survives reloads. Continue resumes server checkpoints; each account shows its actual checked window."
              : "Edited criteria apply to Start new search. Continue keeps the original window. Results remain in this page until you leave or start a new search."}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-0 text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      {(window || companyMode) && (
        <>
          {window && (
            <section aria-label="Search progress" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="m-0 text-base font-semibold">
                  {complete
                    ? "Search complete"
                    : busy
                      ? `Searching ${runs.filter((r) => r.status === "requesting").length} accounts`
                      : "Search paused or incomplete"}{" "}
                  ·{" "}
                  {companyMode
                    ? `${runMessages.length} matches from this check`
                    : `${messages.length} messages returned`}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {window.since ? date(window.since) : "All available dates"} → {date(window.until)}{" "}
                  IST
                </span>
              </div>
              <p className="m-0 text-xs text-muted-foreground">
                Incoming folders include spam, junk and trash. Sent/drafts/outbox are skipped.
                Separate online archives are outside coverage. Searches pause after {pagesPerPass}{" "}
                pages per account per pass; Continue resumes the same window.
              </p>
              <div className="grid divide-y divide-border rounded-2xl border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
                {runs.map((run) => (
                  <article
                    key={run.account.id}
                    aria-label={`Search status for ${run.account.email}`}
                    className="min-w-0 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="break-all text-sm font-medium">{run.account.email}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {run.account.provider}
                        </span>
                      </div>
                      <span
                        role="status"
                        className={cn(
                          "text-xs font-medium",
                          run.status === "failed" || run.status === "limited"
                            ? "text-destructive"
                            : run.status === "requesting"
                              ? "text-link"
                              : "text-muted-foreground",
                        )}
                      >
                        {statuses[run.status]}
                      </span>
                    </div>
                    <p className="mb-0 mt-2 text-xs text-muted-foreground">
                      {run.pages} {run.pages === 1 ? "page" : "pages"} · {run.fetched} fetched ·{" "}
                      {run.messages.length} unique returned · {run.skippedContext} sent/draft/outbox
                      skipped · {run.skippedOutsideWindow} outside window
                    </p>
                    {run.tracking && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p className="m-0">
                          {run.tracking.saved} saved · {run.tracking.alreadyKnown} already known ·{" "}
                          {run.tracking.excluded} excluded
                        </p>
                        <p className="m-0">
                          {run.tracking.window.since
                            ? date(run.tracking.window.since)
                            : "All dates"}{" "}
                          → {date(run.tracking.window.until)} IST
                        </p>
                        {run.tracking.cacheHit && (
                          <p className="m-0 text-link">
                            Already covered · used saved mail, no provider request.
                          </p>
                        )}
                        {run.tracking.resumed && (
                          <p className="m-0">Resumed the saved window shown above.</p>
                        )}
                        {Boolean(run.tracking.unavailable) && <p className="m-0">{run.tracking.unavailable} messages disappeared before their bodies could be read.</p>}
                    {run.tracking.rejected.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-link">
                              Why messages were excluded
                            </summary>
                            <ul className="space-y-2 pl-4">
                              {run.tracking.rejected.map((row, i) => (
                                <li key={i}>
                                  {row.subject} · {row.sender} · {row.reason}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                    {run.status === "requesting" && (
                      <p className="mb-0 mt-2 text-xs text-link">
                        Requesting page {run.pages + 1} · up to{" "}
                        {run.account.provider === "GMAIL" ? 25 : 50} messages. Waiting for the
                        provider response.
                      </p>
                    )}
                    {run.error && (
                      <p role="alert" className="mb-0 mt-2 text-xs text-destructive">
                        {run.error}
                      </p>
                    )}
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-link">
                        Query and page activity
                      </summary>
                      <p className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono">
                        {run.tracking?.cacheHit
                          ? "Used persistent coverage; no provider query was sent."
                          : (run.query ??
                            "The exact provider query will appear with its first response.")}
                      </p>
                      {!run.events.length ? (
                        <p className="text-muted-foreground">No page response yet.</p>
                      ) : (
                        <ol className="space-y-2 pl-4 text-muted-foreground">
                          {run.events.map((event, index) => (
                            <li key={index}>
                              Page {event.page} · {date(event.time)} · {event.detail}
                            </li>
                          ))}
                        </ol>
                      )}
                    </details>
                  </article>
                ))}
              </div>
            </section>
          )}
          <section
            aria-label="Search results"
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="m-0 text-base font-semibold">
                {companyMode ? `Saved ${initial?.name} mail` : "Messages"} · {filtered.length}
              </h2>
              {companyMode && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    disabled={loadingSaved || busy}
                    aria-pressed={savedView === "kept"}
                    className={cn(
                      "rounded-full px-3 py-2",
                      savedView === "kept" && "bg-selected text-selected-foreground",
                    )}
                    onClick={() => void loadSaved("kept")}
                  >
                    Kept ({savedMail.counts.kept})
                  </button>
                  <button
                    disabled={loadingSaved || busy}
                    aria-pressed={savedView === "excluded"}
                    className={cn(
                      "rounded-full px-3 py-2",
                      savedView === "excluded" && "bg-selected text-selected-foreground",
                    )}
                    onClick={() => void loadSaved("excluded")}
                  >
                    Excluded ({savedMail.counts.excluded})
                  </button>
                  <Link
                    className="px-2 py-2 text-link"
                    href={`/mail?company=${encodeURIComponent(initialCompany)}`}
                  >
                    Open tracked company mail
                  </Link>
                </div>
              )}
              <label className="text-xs">
                Results account
                <select
                  className="ml-2 !w-auto max-w-full"
                  value={resultAccount}
                  onChange={(e) => {
                    setResultAccount(e.target.value);
                    setResultPage(0);
                  }}
                >
                  <option value="">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.email}>
                      {account.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid min-h-80 lg:grid-cols-2">
              <div
                className={cn("min-w-0 lg:border-r lg:border-border", reading && "hidden lg:block")}
              >
                {!shown.length ? (
                  <div className="p-10 text-sm text-muted-foreground">
                    <Mail size={24} className="mb-3" />
                    {busy
                      ? "Messages appear here as each page returns."
                      : companyMode
                        ? savedView === "excluded"
                          ? "No exclusions recorded."
                          : "No saved job-search matches yet. Check company mail or refine the rules."
                        : complete
                          ? "No incoming messages matched these criteria."
                          : "No messages returned yet. Check account activity above."}
                  </div>
                ) : (
                  shown.map((m) => (
                    <button
                      key={m.identity}
                      onClick={() => {
                        setSelected(m.identity);
                        setReading(true);
                      }}
                      className={cn(
                        "block w-full border-b border-border px-5 py-4 text-left hover:bg-muted",
                        selected === m.identity && "bg-selected text-selected-foreground",
                      )}
                    >
                      <span className="flex justify-between gap-3 text-xs">
                        <span className="truncate font-medium">{m.senderName || m.sender}</span>
                        <span className="shrink-0 text-muted-foreground">{date(m.receivedAt)}</span>
                      </span>
                      <span className="mt-1.5 block text-sm font-medium">{m.subject}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {m.snippet || m.bodyText?.slice(0, 160)}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{m.account}</span>
                        <ChevronRight size={12} />
                        <span className="capitalize">{label(m.classification.type)}</span>
                        <span>{m.folders.join(" / ")}</span>
                      </span>
                    </button>
                  ))
                )}
                {companyMode && savedMail.nextBefore && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loadingSaved}
                    onClick={() => void loadSaved(savedView, true)}
                  >
                    {loadingSaved ? "Loading saved mail…" : "Load older saved mail"}
                  </Button>
                )}
                {filtered.length > 50 && (
                  <div className="flex items-center justify-between p-3 text-xs">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!resultPage}
                      onClick={() => setResultPage((v) => v - 1)}
                    >
                      Previous
                    </Button>
                    <span>
                      {resultPage * 50 + 1}–{Math.min((resultPage + 1) * 50, filtered.length)} of{" "}
                      {filtered.length}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={(resultPage + 1) * 50 >= filtered.length}
                      onClick={() => setResultPage((v) => v + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
              <div
                aria-label="Search message reader"
                className={cn("min-w-0 p-5 lg:p-7", !reading && "hidden lg:block")}
              >
                <button
                  type="button"
                  className="mb-4 inline-flex items-center gap-1 text-xs text-link lg:hidden"
                  onClick={() => setReading(false)}
                >
                  <ArrowLeft size={14} />
                  Back to results
                </button>
                {message ? (
                  <>
                    <h3 className="m-0 text-lg font-semibold">{message.subject}</h3>
                    <p className="mt-4 break-all text-sm">
                      {message.senderName} &lt;{message.sender}&gt;
                    </p>
                    <p className="text-xs text-muted-foreground">
                      To {message.recipient || message.account} · {date(message.receivedAt)} IST
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {message.account} · {message.folders.join(" / ")}
                    </p>
                    {message.decision && (
                      <p
                        className={cn(
                          "mt-4 rounded-xl p-3 text-xs",
                          message.decision.kept
                            ? "bg-selected text-selected-foreground"
                            : "bg-review text-review-foreground",
                        )}
                      >
                        {message.decision.kept ? "Kept" : "Excluded"}: {message.decision.reason}.{" "}
                        {message.decision.evidence.join(". ")}
                      </p>
                    )}
                    <div className="my-5 border-y border-border py-3 text-xs text-muted-foreground">
                      <p className="m-0 capitalize">
                        Detected: {label(message.classification.type)} · rule confidence{" "}
                        {Math.round(message.classification.confidence * 100)}%
                      </p>
                      <p className="mb-0 mt-2">
                        {message.classification.reasons.join(". ")}. This label does not hide the
                        message or update an application.
                      </p>
                    </div>
                    <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7">
                      {message.bodyText ||
                        message.snippet ||
                        "No readable text returned by the provider."}
                    </div>
                    <details className="mt-6 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Message identity</summary>
                      <p className="break-all">{message.identity}</p>
                      <p className="break-all">{message.internetMessageId}</p>
                    </details>
                  </>
                ) : (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    Select a message to read its content and parsing reasons.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
      {!window && !companyMode && (
        <p className="py-5 text-center text-sm text-muted-foreground">
          Leave the search fields empty to review all incoming mail in your chosen window.
          Unrecognized messages are included.
        </p>
      )}
    </div>
  );
}
