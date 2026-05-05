import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
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

  const reimport = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/settings/import-yaml");
      if (error) throw new Error(apiErrorMessage(error, "reimport failed"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => reimport.mutate()}
          disabled={reimport.isPending}
        >
          <Upload className="w-3 h-3" />
          {reimport.isPending ? "Importing…" : "Re-import YAML"}
        </Button>
      </div>

      <Card className="space-y-3">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {Object.entries(draft).map(([source, cfg]: [string, any]) => (
          <div key={source} className="flex items-center justify-between">
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
            <label className="text-xs flex items-center gap-2">
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
