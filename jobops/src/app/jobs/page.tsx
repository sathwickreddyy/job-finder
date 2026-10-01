import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, jobStatuses, jobSnapshots } from "@/db/schema";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { ArrowUpRight } from "lucide-react";
export default async function SavedOpenings({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; company?: string }>;
}) {
  const p = await searchParams;
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(
        p.company ? ilike(jobs.company, `%${p.company}%`) : undefined,
        jobStatuses.includes(p.status as (typeof jobStatuses)[number])
          ? eq(jobs.status, p.status as (typeof jobStatuses)[number])
          : undefined,
        p.q
          ? or(
              ilike(jobs.title, `%${p.q}%`),
              ilike(jobs.company, `%${p.q}%`),
              sql`exists (select 1 from ${jobSnapshots} where ${jobSnapshots.jobId}=${jobs.id} and ${jobSnapshots.description} ilike ${`%${p.q}%`})`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(300);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved openings"
        description="The roles and descriptions you brought back from your search."
        actions={
          <Button asChild>
            <Link href="/jobs/new">Save a job description</Link>
          </Button>
        }
      />
      <form className="flex flex-wrap gap-3">
        <input
          className="!w-auto min-w-0 flex-1"
          type="search"
          name="q"
          aria-label="Search openings"
          defaultValue={p.q}
          placeholder="Search company, role or description"
        />
        <Button variant="outline">Search</Button>
        <details className="w-full">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Filter by company or status
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input name="company" aria-label="Company filter" defaultValue={p.company} />
            <select name="status" aria-label="Job status" defaultValue={p.status ?? ""}>
              <option value="">All openings</option>
              {jobStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <Button variant="outline">Filter jobs</Button>
          </div>
        </details>
      </form>
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="pressable rounded-card border border-border bg-card p-6 text-foreground hover:border-primary hover:no-underline"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold">{job.title}</h2>
                <ArrowUpRight size={18} aria-hidden />
              </div>
              <p className="mt-2 font-medium">{job.company}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {job.location || "Location not recorded"} · {job.source.replaceAll("_", " ")}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {job.status.toLowerCase().replaceAll("_", " ")}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No saved openings yet"
          description="Start with the search prompt, then save one role you want to pursue."
          action={
            <Button asChild>
              <Link href="/find">Find openings</Link>
            </Button>
          }
        />
      )}
      <Link href="/import/jobs" className="inline-block text-sm text-link">
        Import a list of openings
      </Link>
    </div>
  );
}
