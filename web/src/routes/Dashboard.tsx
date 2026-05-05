import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Play, Target, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/layout/PageHeader";
import { JobTable } from "../components/job/JobTable";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api, apiErrorMessage } from "../lib/api-client";
import { formatRelative, formatDateTime } from "../lib/format";

export default function Dashboard() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/dashboard");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data!;

  const cards = [
    {
      label: "P0",
      value: d.counts_by_priority.P0 ?? 0,
      tone: "text-accent",
      hint: "Apply first",
    },
    {
      label: "P1",
      value: d.counts_by_priority.P1 ?? 0,
      tone: "text-accent-amber",
      hint: "Review next",
    },
    {
      label: "P2",
      value: d.counts_by_priority.P2 ?? 0,
      tone: "text-text-muted",
      hint: "Keep warm",
    },
    { label: "Total", value: d.total_jobs, tone: "text-text", hint: "Tracked jobs" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command center"
        title="Dashboard"
        description="Start here each day: see the shortlist, upcoming interviews, and whether the search pipeline needs a refresh."
        meta={
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-black/15 px-3 py-1 text-xs text-text-muted">
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
            Last run: {d.last_run_at ? formatRelative(d.last_run_at) : "never"}
          </div>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/tracker")}>
              <Target className="h-4 w-4" />
              Open tracker
            </Button>
            <Button variant="primary" onClick={() => navigate("/search")}>
              <Play className="h-4 w-4" />
              Run search
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="relative overflow-hidden">
            <div className="absolute right-4 top-4 h-12 w-12 rounded-full bg-accent/10 blur-xl" />
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-text-muted">
              {c.label}
            </div>
            <div className={`mt-2 text-4xl font-black tabular-nums ${c.tone}`}>
              {String(c.value).padStart(2, "0")}
            </div>
            <div className="mt-2 text-xs text-text-faint">{c.hint}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.5fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Upcoming interviews</h3>
              <p className="text-xs text-text-muted">Time-sensitive follow-ups.</p>
            </div>
            <CalendarClock className="h-5 w-5 text-accent" />
          </div>
          {d.upcoming_interviews.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {d.upcoming_interviews.map((u) => (
                <li
                  key={u.job_id}
                  className="rounded-2xl border border-border bg-black/15 p-3"
                >
                  <div className="font-medium">{u.company}</div>
                  <div className="mt-1 text-xs text-text-muted">{u.role}</div>
                  <div className="mt-3 text-xs font-semibold tabular-nums text-accent">
                    {formatDateTime(u.next_interview_at)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-4 text-xs leading-5 text-text-muted">
              No interviews scheduled. Move an application to Interviewing to pin it here.
            </p>
          )}
        </Card>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Top shortlist</h3>
            <p className="text-xs text-text-muted">Highest priority matches ready for action.</p>
          </div>
          <JobTable rows={d.shortlist_top} />
        </div>
      </div>
    </div>
  );
}
