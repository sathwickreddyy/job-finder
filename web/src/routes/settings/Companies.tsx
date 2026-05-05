import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api, apiErrorMessage } from "../../lib/api-client";

const ATS = ["greenhouse", "ashby", "lever", "workday", "manual", "unknown"];
const PRIORITIES = ["P0", "P1", "P2"];

export default function Companies() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "companies"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/companies");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  const [newRow, setNewRow] = useState({
    name: "",
    ats_type: "unknown",
    priority: "P2",
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/settings/companies", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: newRow as any,
      });
      if (error) throw new Error(apiErrorMessage(error, "add failed"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "companies"] });
      setNewRow({ name: "", ats_type: "unknown", priority: "P2" });
    },
  });

  const patch = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: any;
    }) => {
      const { error } = await api.PATCH("/api/settings/companies/{cid}", {
        params: { path: { cid: id } },
        body,
      });
      if (error) throw new Error(apiErrorMessage(error, "update failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/settings/companies/{cid}", {
        params: { path: { cid: id } },
      });
      if (error) throw new Error(apiErrorMessage(error, "delete failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Companies</h2>

      <Card className="flex gap-2 items-end">
        <Input
          placeholder="Name"
          value={newRow.name}
          onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
        />
        <Select
          value={newRow.ats_type}
          onChange={(e) => setNewRow({ ...newRow, ats_type: e.target.value })}
        >
          {ATS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Select
          value={newRow.priority}
          onChange={(e) => setNewRow({ ...newRow, priority: e.target.value })}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          disabled={!newRow.name || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="w-3 h-3" /> Add
        </Button>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-text-muted">
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">ATS</th>
              <th className="text-left px-4 py-3 font-medium">Token/slug</th>
              <th className="text-left px-4 py-3 font-medium">Priority</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {q.data!.map((c: any) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-text-muted">
                  <Select
                    defaultValue={c.ats_type}
                    onChange={(e) =>
                      patch.mutate({
                        id: c.id,
                        body: { ats_type: e.target.value },
                      })
                    }
                  >
                    {ATS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-2 text-text-muted text-xs">
                  {c.board_token || c.org_slug || c.company_slug || "—"}
                </td>
                <td className="px-4 py-2">
                  <Select
                    defaultValue={c.priority}
                    onChange={(e) =>
                      patch.mutate({
                        id: c.id,
                        body: { priority: e.target.value },
                      })
                    }
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => remove.mutate(c.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
