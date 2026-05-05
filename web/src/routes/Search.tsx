import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, X, Plus } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
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
      const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
      try {
        const { data, error } = await api.POST("/api/search", {
          body: { location: location || undefined, keyword: keyword || undefined, use_llm: true },
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
      } else if (e.message.includes("timeout") || e.message.includes("exceeded 120")) {
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
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Search</h2>
        <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
          <Plus className="w-3 h-3" />
          Add manual job
        </Button>
      </div>

      <Card>
        <div className="flex gap-3">
          <Input
            placeholder="Location filter (Bengaluru, India, remote…)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={run.isPending}
          />
          <Input
            placeholder="Keyword / role"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            disabled={run.isPending}
          />
          {run.isPending ? (
            <>
              <Button variant="primary" disabled>
                Searching… ({elapsed}s)
              </Button>
              <Button variant="danger" onClick={cancel}>
                <X className="w-3 h-3" />
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => run.mutate()}>
              <Play className="w-3 h-3" />
              Run search
            </Button>
          )}
        </div>
      </Card>

      {cancelError && <ErrorState message={cancelError} />}

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
