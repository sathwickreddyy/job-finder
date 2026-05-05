import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  X,
  Plus,
  Search as SearchIcon,
  SlidersHorizontal,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/layout/PageHeader";
import { JobTable } from "../components/job/JobTable";
import { SourceStatsBar } from "../components/job/SourceStatsBar";
import { ManualJobDialog } from "../components/job/ManualJobDialog";
import { ErrorState } from "../components/shared/ErrorState";
import { api, apiErrorMessage } from "../lib/api-client";
import type { components } from "../lib/api-types";

type SearchResponse = components["schemas"]["SearchResponse"];

export default function Search() {
  const [location, setLocation] = useState("");
  const [keyword, setKeyword] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const run = useMutation({
    mutationFn: async () => {
      abortRef.current = new AbortController();
      const started = Date.now();
      const timer = setInterval(
        () => setElapsed(Math.floor((Date.now() - started) / 1000)),
        500,
      );
      try {
        const { data, error } = await api.POST("/api/search", {
          body: {
            location: location || undefined,
            keyword: keyword || undefined,
            use_llm: true,
          },
          signal: abortRef.current.signal,
        });
        if (error) throw new Error(apiErrorMessage(error, "search failed"));
        return data!;
      } finally {
        clearInterval(timer);
      }
    },
    onSuccess: (d) => {
      setResult(d);
      setElapsed(0);
      setCancelError(null);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => {
      if (e.name === "AbortError") {
        setCancelError("Search cancelled.");
      } else if (
        e.message.includes("timeout") ||
        e.message.includes("exceeded 120")
      ) {
        setCancelError(
          "Search exceeded 120s — some sources are very slow. Try disabling ycombinator or greenhouse in Sources settings.",
        );
      } else {
        setCancelError(e.message);
      }
      setElapsed(0);
    },
  });

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Source sweep"
        title="Search"
        description="Fetch from enabled sources, score the results, and save only the leads that match your current target profile."
        meta={
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-black/15 px-3 py-1 text-xs text-text-muted">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
            Filters are optional. Blank search uses your configured profile.
          </div>
        }
        actions={
          <Button variant="secondary" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" />
            Add manual job
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <SearchIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Run a fresh search</h3>
            <p className="text-xs text-text-muted">
              Use a location or role keyword only when you want to narrow the configured pipeline.
            </p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">
              Location
            </span>
            <Input
              placeholder="Location filter (Bengaluru, India, remote…)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={run.isPending}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">
              Keyword
            </span>
            <Input
              placeholder="Keyword / role"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={run.isPending}
            />
          </label>
          <div className="flex items-end gap-2">
            {run.isPending ? (
              <>
                <Button variant="primary" disabled>
                  Searching… ({elapsed}s)
                </Button>
                <Button variant="danger" onClick={cancel}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                onClick={() => run.mutate()}
                className="w-full lg:w-auto"
              >
                <Play className="h-4 w-4" />
                Run search
              </Button>
            )}
          </div>
        </div>
      </Card>

      {cancelError && <ErrorState message={cancelError} />}

      {!result && !run.isPending && !cancelError && (
        <Card>
          <div className="max-w-3xl">
            <div className="text-sm font-semibold text-text">No search run yet</div>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Enter an optional location or keyword above, then{" "}
              <span className="text-text">Run search</span> to fetch from
              enabled sources. You can also{" "}
              <button
                type="button"
                className="text-accent underline-offset-2 hover:underline"
                onClick={() => setManualOpen(true)}
              >
                add a manual job
              </button>{" "}
              (LinkedIn / Naukri / recruiter DM) instead.
            </p>
          </div>
        </Card>
      )}

      {result && (
        <>
          <SourceStatsBar stats={result.source_stats} />
          <JobTable rows={result.jobs} />
        </>
      )}

      <ManualJobDialog open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
