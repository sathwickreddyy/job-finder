import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api, apiErrorMessage } from "../../lib/api-client";

export default function Sources() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "sources"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/sources");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draft, setDraft] = useState<Record<string, any>>({});
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/sources", { body: draft });
      if (error) throw new Error(apiErrorMessage(error, "save failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "sources"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fetch pipeline"
        title="Sources"
        description="Enable only the providers you actually want in daily search. Disabled sources are skipped entirely."
      />

      <Card className="grid gap-3">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {Object.entries(draft).map(([source, cfg]: [string, any]) => (
          <div
            key={source}
            className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-black/15 p-4"
          >
            <div>
              <div className="font-medium">{source}</div>
              <div className="text-xs text-text-muted">
                {source === "ycombinator"
                  ? "YC Work at a Startup (India filter)"
                  : source === "manual"
                    ? "Paste LinkedIn/Naukri/recruiter posts"
                    : "Public jobs feed"}
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={!!cfg.enabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [source]: { ...cfg, enabled: e.target.checked },
                  })
                }
              />
              enabled
            </label>
          </div>
        ))}
      </Card>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
