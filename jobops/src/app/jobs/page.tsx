import Link from "next/link";
import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, jobStatuses, jobResumeMatches, resumeVersions, resumes } from "@/db/schema";
import { PageHeader, Button, EmptyState, StatusBadge } from "@/components/ui";
import { dateLabel, label } from "@/lib/utils";
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const filters = [];
  if (p.q)
    filters.push(
      or(
        ilike(jobs.title, `%${p.q}%`),
        ilike(jobs.company, `%${p.q}%`),
        ilike(jobs.notes, `%${p.q}%`),
      ),
    );
  for (const key of ["company", "title", "location", "source"] as const)
    if (p[key]) filters.push(ilike(jobs[key], `%${p[key]}%`));
  if (jobStatuses.includes(p.status as (typeof jobStatuses)[number]))
    filters.push(eq(jobs.status, p.status as (typeof jobStatuses)[number]));
  if (p.freshness && Number(p.freshness) > 0)
    filters.push(
      gte(jobs.postedAt, new Date(new Date().getTime() - Math.min(Number(p.freshness), 365) * 86400000)),
    );
  if (p.experience && Number.isFinite(Number(p.experience)) && Number(p.experience) >= 0)
    filters.push(
      and(
        or(sql`${jobs.experienceMin} is null`, lte(jobs.experienceMin, Number(p.experience))),
        or(sql`${jobs.experienceMax} is null`, gte(jobs.experienceMax, Number(p.experience))),
      ),
    );
  const coverage = db
    .select({
      jobId: jobResumeMatches.jobId,
      score: sql<number>`max(${jobResumeMatches.score})`.as("score"),
    })
    .from(jobResumeMatches)
    .innerJoin(resumeVersions, eq(jobResumeMatches.resumeVersionId,resumeVersions.id))
    .innerJoin(resumes, eq(resumeVersions.resumeId,resumes.id))
    .where(and(eq(resumeVersions.isCurrent,true),eq(resumes.isActive,true)))
    .groupBy(jobResumeMatches.jobId)
    .as("coverage");
  const where = and(...filters),
    page = Math.max(1, Math.min(10000, Number.parseInt(p.page ?? "1") || 1));
  const [rows, total] = await Promise.all([
    db
      .select({ job: jobs, score: coverage.score })
      .from(jobs)
      .leftJoin(coverage, eq(jobs.id, coverage.jobId))
      .where(where)
      .orderBy(
        p.sort === "coverage"
          ? sql`${coverage.score} desc nulls last`
          : p.sort === "posted"
            ? sql`${jobs.postedAt} desc nulls last`
            : desc(jobs.createdAt),
      )
      .limit(50)
      .offset((page - 1) * 50),
    db.select({ count: count() }).from(jobs).where(where),
  ]);
  const pageUrl = (n: number) => {
    const query = new URLSearchParams(
      Object.entries(p).filter((e): e is [string, string] => e[1] !== undefined),
    );
    query.set("page", String(n));
    return `/jobs?${query}`;
  };
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Review opportunities, shortlist the right roles, and prepare deliberately."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/import/jobs">Import jobs</Link>
            </Button>
            <Button asChild>
              <Link href="/jobs/new">Add job</Link>
            </Button>
          </>
        }
      />
      <form className="filter-bar" method="get">
        <input
          aria-label="Search jobs"
          name="q"
          defaultValue={p.q}
          placeholder="Search company, role or notes"
        />
        {(["company", "title", "location", "source"] as const).map((key) => (
          <input
            key={key}
            aria-label={`Filter ${key}`}
            name={key}
            defaultValue={p[key]}
            placeholder={key === "title" ? "Role" : label(key)}
            style={{ maxWidth: 155 }}
          />
        ))}
        <select aria-label="Job status" name="status" defaultValue={p.status ?? ""}>
          <option value="">All statuses</option>
          {jobStatuses.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select name="freshness" aria-label="Posted date" defaultValue={p.freshness ?? ""}>
          <option value="">Any posted date</option>
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <input
          name="experience"
          aria-label="Years of experience"
          type="number"
          min="0"
          step="0.5"
          defaultValue={p.experience}
          placeholder="Your experience"
          style={{ maxWidth: 155 }}
        />
        <select name="sort" aria-label="Sort jobs" defaultValue={p.sort ?? "added"}>
          <option value="added">Recently added</option>
          <option value="posted">Newest posted</option>
          <option value="coverage">Keyword coverage</option>
        </select>
        <Button variant="secondary">Filter jobs</Button>
        <Link className="button-quiet" href="/jobs">
          Clear
        </Link>
      </form>
      <div className="mb-4 flex flex-wrap justify-between gap-3 text-sm text-muted-foreground">
        <span>{total[0].count} opportunities · Coverage is saved from job detail comparisons</span>
        <div className="flex gap-4">
          <a href="/api/export?entity=jobs&format=csv">Export CSV</a>
          <a href="/api/export?entity=jobs&format=json">Export JSON</a>
        </div>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Location</th>
                <th>Experience</th>
                <th>Source / posted</th>
                <th>Keyword coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, score }) => (
                <tr key={job.id}>
                  <td>
                    <Link className="cell-title" href={`/jobs/${job.id}`}>
                      {job.title}
                    </Link>
                    <div className="cell-subtitle">{job.company}</div>
                  </td>
                  <td>
                    {job.location || "Unknown"}
                    <div className="cell-subtitle">{label(job.workMode)}</div>
                  </td>
                  <td>
                    {job.experienceMin ?? "?"}–{job.experienceMax ?? "?"} years
                  </td>
                  <td>
                    {label(job.source)}
                    <div className="cell-subtitle">{dateLabel(job.postedAt)}</div>
                  </td>
                  <td>{score === null ? "Not compared" : `${Math.round(score)}%`}</td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No jobs match these filters"
          description="Adjust your filters, add a job, or create a discovery mission."
          action={
            <Button asChild>
              <Link href="/missions/new?type=DISCOVER_JOBS">Find jobs</Link>
            </Button>
          }
        />
      )}
      <div className="mt-5 flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Page {page}</span>
        {page > 1 && <Link href={pageUrl(page - 1)}>Previous page</Link>}
        {page * 50 < total[0].count && <Link href={pageUrl(page + 1)}>Next page</Link>}
      </div>
    </>
  );
}
