"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui";
import type { SearchResponse } from "./search-state";
import { mailSearchSchema, resolveMailSearch } from "./search-contract";

/** Provider search saves into the existing workspace, never a second result list. */
export function HistorySearchPanel({
  companies,
  accounts,
  initialCompany,
  initialAccount,
  onPending,
  onOpenResults,
}: {
  companies: { id: string; name: string }[];
  accounts: { email: string }[];
  initialCompany: string;
  initialAccount?: string;
  onPending(value: boolean): void;
  onOpenResults(company: string, notice: string): void;
}) {
  const [company, setCompany] = useState(initialCompany);
  const [account, setAccount] = useState(initialAccount ?? "");
  const [duration, setDuration] = useState("30");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [hasResults, setHasResults] = useState(false);
  const active = useRef(false);

  async function search(resume: boolean) {
    if (active.current) return;
    active.current = true;
    setError("");
    setPending(true);
    onPending(true);
    let next = resume ? cursor : null;
    try {
      const request = resolveMailSearch(
        mailSearchSchema.parse({
          ...(account ? { accounts: [account] } : {}),
          ...(duration === "dates"
            ? {
                since: new Date(`${since}T00:00:00+05:30`).toISOString(),
                ...(until ? { until: new Date(`${until}T00:00:00+05:30`).toISOString() } : {}),
              }
            : duration === "all"
              ? {}
              : { lastDays: Number(duration) }),
        }),
      );
      mailSearchSchema.parse(request);
      let saved = 0;
      for (let page = 0; page < 4; page++) {
        const response = await fetch("/api/v1/mail/company/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            next
              ? { companyCursor: next }
              : {
                  company,
                  mode: "history",
                  since: request.since,
                  until: request.until,
                  accounts: request.accounts,
                },
          ),
          cache: "no-store",
        });
        const result = (await response.json()) as SearchResponse & { error?: string };
        if (!response.ok)
          throw new Error(
            result.error ?? "Search could not finish. Retry to resume saved progress.",
          );
        saved += result.accounts.reduce((sum, row) => sum + (row.tracking?.saved ?? 0), 0);
        next = result.nextCursor;
        setCursor(next);
        setHasResults(true);
        const problems = result.accounts.flatMap((row) =>
          row.error
            ? [`${row.account}: ${row.error}`]
            : row.limited
              ? [`${row.account}: provider limit reached; search is incomplete.`]
              : [],
        );
        const notice = `${saved} ${saved === 1 ? "match" : "matches"} saved to History. ${result.complete ? "Search complete." : "More mail remains; continue to resume."}`;
        setFeedback(notice);
        if (problems.length || result.warning) {
          setError([...problems, ...(result.warning ? [result.warning] : [])].join(" "));
          break;
        }
        if (result.complete) {
          onOpenResults(company, notice);
          break;
        }
        if (!next) {
          setError("Search is incomplete. Start again to resume saved progress.");
          break;
        }
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Search interrupted. Saved mail is safe; retry to continue.",
      );
    } finally {
      active.current = false;
      setPending(false);
      onPending(false);
    }
  }
  return (
    <div>
      <h3 className="m-0 text-lg font-semibold">Find mail in your inboxes</h3>
      <p className="mb-5 mt-2 text-xs leading-6 text-muted-foreground">
        Uses saved company rules across connected accounts, including spam. Matching messages are
        saved to History.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search(false);
        }}
      >
        <fieldset
          disabled={pending}
          className="min-w-0 space-y-4"
          onChange={() => {
            setCursor(null);
            setHasResults(false);
            setFeedback("");
          }}
        >
          <label className="block text-xs">
            Company
            <select
              required
              className="mt-1.5"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            >
              <option value="">Choose a company</option>
              {companies.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Dates
            <select
              className="mt-1.5"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All available history</option>
              <option value="dates">Choose dates</option>
            </select>
          </label>
          {duration === "dates" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                From (India time)
                <input
                  required
                  type="date"
                  className="mt-1.5"
                  value={since}
                  onChange={(event) => setSince(event.target.value)}
                />
              </label>
              <label className="text-xs">
                Before (blank = now)
                <input
                  type="date"
                  className="mt-1.5"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                />
              </label>
            </div>
          )}
          <details>
            <summary className="cursor-pointer py-1 text-xs text-link">
              {account || "All connected accounts"}
            </summary>
            <label className="mt-2 block text-xs">
              Search account
              <select
                className="mt-1.5"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              >
                <option value="">All connected accounts</option>
                {accounts.map((row) => (
                  <option key={row.email}>{row.email}</option>
                ))}
              </select>
            </label>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!company || !accounts.length} className="shadow-surface">
              <Search size={16} aria-hidden />
              {pending ? "Searching…" : "Find mail"}
            </Button>
            {cursor && (
              <Button type="button" variant="outline" onClick={() => void search(true)}>
                Continue search
              </Button>
            )}
          </div>
        </fieldset>
      </form>
      {feedback && (
        <p role="status" className="mt-4 text-xs text-muted-foreground">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-xs text-destructive">
          {error}
        </p>
      )}
      {hasResults && !pending && (
        <Button variant="outline" className="mt-2" onClick={() => onOpenResults(company, feedback)}>
          View saved mail
          <ArrowRight size={15} aria-hidden />
        </Button>
      )}
      <details className="mt-6 border-t border-border pt-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Search without company rules
        </summary>
        <p className="leading-6 text-muted-foreground">
          A temporary search for a sender or phrase. These results are not added to your application
          mail.
        </p>
        <Link
          href={`/mail/search${account ? `?${new URLSearchParams({ account })}` : ""}`}
          className="text-link"
        >
          Open advanced inbox search
        </Link>
      </details>
    </div>
  );
}
