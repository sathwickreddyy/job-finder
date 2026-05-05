import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api, apiErrorMessage } from "../../lib/api-client";

export default function Profile() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "profile"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/profile");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draft, setDraft] = useState<any>({});
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/profile", {
        body: draft,
      });
      if (error) throw new Error(apiErrorMessage(error, "save failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "profile"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setField(key: string, value: any) {
    setDraft({ ...draft, [key]: value });
  }
  function setList(key: string, csv: string) {
    setDraft({
      ...draft,
      [key]: csv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight">Profile</h2>
      <Card className="space-y-3">
        <label className="block text-xs text-text-muted">Name</label>
        <Input
          value={draft.name ?? ""}
          onChange={(e) => setField("name", e.target.value)}
        />

        <label className="block text-xs text-text-muted">
          Years of experience
        </label>
        <Input
          type="number"
          value={draft.years_of_experience ?? 0}
          onChange={(e) =>
            setField("years_of_experience", Number(e.target.value))
          }
        />

        <label className="block text-xs text-text-muted">
          Target roles (comma-separated)
        </label>
        <Input
          value={(draft.target_roles ?? []).join(", ")}
          onChange={(e) => setList("target_roles", e.target.value)}
        />

        <label className="block text-xs text-text-muted">
          Preferred locations
        </label>
        <Input
          value={(draft.preferred_locations ?? []).join(", ")}
          onChange={(e) => setList("preferred_locations", e.target.value)}
        />

        <label className="block text-xs text-text-muted">Strong skills</label>
        <Input
          value={(draft.strong_skills ?? []).join(", ")}
          onChange={(e) => setList("strong_skills", e.target.value)}
        />

        <label className="block text-xs text-text-muted">Avoid skills</label>
        <Input
          value={(draft.avoid_skills ?? []).join(", ")}
          onChange={(e) => setList("avoid_skills", e.target.value)}
        />

        <label className="block text-xs text-text-muted">
          Exclude locations (forces Ignore)
        </label>
        <Input
          value={(draft.exclude_locations ?? []).join(", ")}
          onChange={(e) => setList("exclude_locations", e.target.value)}
        />

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
