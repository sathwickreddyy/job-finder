import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { and, desc, eq, ilike, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { applications, applicationStages, jobs, resumeVersions, resumes } from "@/db/schema";
import { PageHeader, Button, StatusBadge, EmptyState } from "@/components/ui";
import { label } from "@/lib/utils";
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const filters = [];
  if (p.q)
    filters.push(
      or(
        ilike(jobs.company, `%${p.q}%`),
        ilike(jobs.title, `%${p.q}%`),
        ilike(applications.notes, `%${p.q}%`),
      ),
    );
  if (applicationStages.includes(p.status as (typeof applicationStages)[number]))
    filters.push(eq(applications.status, p.status as (typeof applicationStages)[number]));
  if (p.followup === "due") filters.push(lte(applications.nextActionAt, new Date()));
  const rows = await db
    .select({ app: applications, job: jobs, version: resumeVersions, family: resumes })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .leftJoin(resumeVersions, eq(applications.resumeVersionId, resumeVersions.id))
    .leftJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(and(...filters))
    .orderBy(desc(applications.updatedAt))
    .limit(300);
  const board = p.view === "board";
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title="Applications"
        description="Track preparation, review and recruiting stages with an auditable timeline."
        actions={
          <Button asChild>
            <Link href="/applications/new">New application</Link>
          </Button>
        }
      />
      <form className="filter-bar">
        <input
          name="q"
          aria-label="Search applications"
          defaultValue={p.q}
          placeholder="Search company, role or notes"
        />
        <select name="status" aria-label="Application stage filter" defaultValue={p.status ?? ""}>
          <option value="">All stages</option>
          {applicationStages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="followup" aria-label="Follow-up filter" defaultValue={p.followup ?? ""}>
          <option value="">Any follow-up date</option>
          <option value="due">Follow-up due</option>
        </select>
        <select name="view" aria-label="Application view" defaultValue={p.view ?? "table"}>
          <option value="table">Table view</option>
          <option value="board">Board view</option>
        </select>
        <Button variant="secondary">Apply filters</Button>
        <Link className="button-quiet" href="/applications">
          Clear
        </Link>
      </form>
      <div className="mb-4 flex justify-between text-sm text-muted-foreground">
        <span>
          {rows.length} applications{rows.length === 300 ? " (first 300)" : ""}
        </span>
        <div className="flex gap-4">
          <a href="/api/export?entity=applications&format=csv">Export CSV</a>
          <a href="/api/export?entity=applications&format=json">Export JSON</a>
        </div>
      </div>
      {!rows.length ? (
        <EmptyState
          title="No applications here yet"
          description="Shortlist a job, select the right resume, and create an application or preparation mission."
          action={
            <Button asChild>
              <Link href="/jobs?status=SHORTLISTED">Review shortlisted jobs</Link>
            </Button>
          }
        />
      ) : board ? (
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {applicationStages
            .filter((stage) => rows.some((r) => r.app.status === stage))
            .map((stage) => (
              <section key={stage} className="min-w-64 max-w-72 flex-1">
                <h2 className="mb-3 text-sm">
                  {label(stage)}{" "}
                  <span className="text-muted-foreground">
                    {rows.filter((r) => r.app.status === stage).length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {rows
                    .filter((r) => r.app.status === stage)
                    .map(({ app, job }) => (
                      <Link
                        href={`/applications/${app.id}`}
                        key={app.id}
                        className="block rounded-xl border border-border bg-card p-4"
                      >
                        <strong>{job.company}</strong>
                        <p className="mt-1 text-sm">{job.title}</p>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Next action: {displayDate(app.nextActionAt, preferences)}
                        </p>
                        <span className="mt-2 block text-xs text-primary">
                          Open and change stage
                        </span>
                      </Link>
                    ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company / role</th>
                <th>Stage</th>
                <th>Resume used</th>
                <th>Applied</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ app, job, version, family }) => (
                <tr key={app.id}>
                  <td>
                    <Link className="cell-title" href={`/applications/${app.id}`}>
                      {job.company}
                    </Link>
                    <div className="cell-subtitle">{job.title}</div>
                  </td>
                  <td>
                    <StatusBadge status={app.status} />
                  </td>
                  <td>{family ? `${family.name} / ${version?.versionLabel}` : "Not selected"}</td>
                  <td>{displayDate(app.appliedAt, preferences)}</td>
                  <td>{displayDate(app.nextActionAt, preferences)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
