import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobs, jobStatuses } from "@/db/schema";
import { Button, PageHeader, Panel, StatusBadge } from "@/components/ui";
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const p = await searchParams;
  const [rows, apps] = await Promise.all([
    db
      .select()
      .from(jobs)
      .where(
        and(
          p.q ? or(ilike(jobs.title, `%${p.q}%`), ilike(jobs.company, `%${p.q}%`)) : undefined,
          jobStatuses.includes(p.status as (typeof jobStatuses)[number])
            ? eq(jobs.status, p.status as (typeof jobStatuses)[number])
            : undefined,
        ),
      )
      .orderBy(desc(jobs.updatedAt))
      .limit(100),
    db.select().from(applications).orderBy(desc(applications.updatedAt)),
  ]);
  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Keep each role, its resume, and your next move together."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/jobs/new">Save a job</Link>
            </Button>
            <Button asChild>
              <Link href="/tasks/new?kind=FIND">Find openings</Link>
            </Button>
          </>
        }
      />
      <form className="mb-6 flex flex-wrap gap-3" action="/opportunities">
        <input
          type="search"
          name="q"
          aria-label="Search opportunities"
          placeholder="Role or company"
          defaultValue={p.q}
          className="min-w-0 flex-1"
        />
        <select
          name="status"
          aria-label="Opportunity status"
          defaultValue={p.status ?? ""}
          className="sm:max-w-48"
        >
          <option value="">All stages</option>
          {jobStatuses.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase().replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {!rows.length ? (
        <Panel className="py-12 text-center">
          <h2 className="text-xl">Room for the right roles.</h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
            Ask your assistant to find openings in India, or save a role you already found on
            LinkedIn or another site.
          </p>
          <Button asChild>
            <Link href="/tasks/new?kind=FIND">Find openings</Link>
          </Button>
        </Panel>
      ) : (
        <div className="space-y-4">
          {rows.map((job) => {
            const app = apps.find((a) => a.jobId === job.id);
            return (
              <Panel key={job.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-base font-semibold text-foreground"
                    >
                      {job.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {job.company} · {job.location || "Location not recorded"}
                    </p>
                  </div>
                  <StatusBadge status={app?.status ?? job.status} />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/tasks/new?kind=TAILOR&jobId=${job.id}`}>Tailor resume</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/tasks/new?kind=APPLY&jobId=${job.id}`}>Prepare application</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href={`/tasks/new?kind=OUTREACH&jobId=${job.id}`}>
                      Referral or outreach
                    </Link>
                  </Button>
                  {app && (
                    <Button asChild variant="ghost">
                      <Link href={`/applications/${app.id}`}>Application history</Link>
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <div className="mt-7 flex flex-wrap gap-5 text-xs text-link">
        <Link href="/jobs">Advanced search</Link>
        <Link href="/applications">All applications</Link>
        <Link href="/contacts">Contacts</Link>
        <Link href="/import/jobs">Import openings</Link>
      </div>
    </>
  );
}
