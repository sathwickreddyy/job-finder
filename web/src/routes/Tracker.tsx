import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, SlidersHorizontal } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/layout/PageHeader";
import { FilterBar } from "../components/job/FilterBar";
import { JobTable } from "../components/job/JobTable";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api, apiErrorMessage } from "../lib/api-client";
import { formatDateTime } from "../lib/format";
import type { operations } from "../lib/api-types";

type JobsQuery = NonNullable<
  operations["list_jobs_api_jobs_get"]["parameters"]["query"]
>;

export default function Tracker() {
  const [params] = useSearchParams();

  const q = useQuery({
    queryKey: ["jobs", params.toString()],
    queryFn: async () => {
      const query: JobsQuery = {};
      if (params.get("q")) query.q = params.get("q");
      if (params.get("status")) query.status = [params.get("status")!];
      if (params.get("priority")) query.priority = [params.get("priority")!];
      if (params.get("location_contains")) query.location_contains = params.get("location_contains");
      const { data, error } = await api.GET("/api/jobs", { params: { query } });
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  const upcoming = useQuery({
    queryKey: ["dashboard-upcoming-only"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/dashboard");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!.upcoming_interviews;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Application pipeline"
        title="Tracker"
        description="Filter saved jobs, update statuses, and schedule interviews without losing context from the scoring model."
        meta={
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-black/15 px-3 py-1 text-xs text-text-muted">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
            Filters update the URL, so views are shareable and reload-safe.
          </div>
        }
      />

      {(upcoming.data?.length ?? 0) > 0 && (
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-accent" />
            <div>
              <h3 className="text-sm font-semibold">Upcoming interviews</h3>
              <p className="text-xs text-text-muted">Keep these visible while updating status.</p>
            </div>
          </div>
          <ul className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
            {upcoming.data!.map((u) => (
              <li key={u.job_id} className="rounded-2xl border border-border bg-black/15 p-3">
                <div className="font-medium">{u.company}</div>
                <div className="mt-1 text-xs text-text-muted">{u.role}</div>
                <div className="mt-3 text-xs font-semibold tabular-nums text-accent">
                  {formatDateTime(u.next_interview_at)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FilterBar />

      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={(q.error as Error).message} />}
      {q.data && <JobTable rows={q.data} />}
    </div>
  );
}
