import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
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
      <h2 className="text-2xl font-semibold tracking-tight">Tracker</h2>

      {(upcoming.data?.length ?? 0) > 0 && (
        <Card>
          <h3 className="text-sm font-semibold mb-3">Upcoming interviews</h3>
          <ul className="space-y-2 text-sm">
            {upcoming.data!.map((u) => (
              <li key={u.job_id} className="flex justify-between">
                <span>
                  <span className="font-medium">{u.company}</span>{" "}
                  <span className="text-text-muted">· {u.role}</span>
                </span>
                <span className="text-accent tabular-nums">{formatDateTime(u.next_interview_at)}</span>
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
