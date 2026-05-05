import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { JobTable } from "../components/job/JobTable";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api } from "../lib/api-client";
import { formatRelative, formatDate } from "../lib/format";

export default function Dashboard() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/dashboard");
      if (error) {
        const e = error as { detail?: { msg?: string }[] };
        throw new Error(e.detail?.[0]?.msg || "load failed");
      }
      return data!;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data!;

  const cards = [
    { label: "P0", value: d.counts_by_priority.P0 ?? 0, tone: "text-accent" },
    { label: "P1", value: d.counts_by_priority.P1 ?? 0, tone: "text-accent-amber" },
    { label: "P2", value: d.counts_by_priority.P2 ?? 0, tone: "text-text-muted" },
    { label: "Total", value: d.total_jobs, tone: "text-text" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <span className="text-xs text-text-muted">
          Last run: {d.last_run_at ? formatRelative(d.last_run_at) : "never"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">
              {c.label}
            </div>
            <div className={`text-3xl font-bold mt-1 ${c.tone}`}>
              {String(c.value).padStart(2, "0")}
            </div>
          </Card>
        ))}
      </div>

      {d.upcoming_interviews.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold mb-3">Upcoming interviews</h3>
          <ul className="space-y-2 text-sm">
            {d.upcoming_interviews.map((u) => (
              <li key={u.job_id} className="flex justify-between">
                <span>
                  <span className="font-medium">{u.company}</span>{" "}
                  <span className="text-text-muted">· {u.role}</span>
                </span>
                <span className="text-accent tabular-nums">{formatDate(u.next_interview_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-3">Top shortlist</h3>
        <JobTable rows={d.shortlist_top as any} />
      </div>
    </div>
  );
}
