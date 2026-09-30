import Link from "next/link";
import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { applications, applicationEvents, jobs, resumeVersions } from "@/db/schema";
import { Button, PageHeader, Panel } from "@/components/ui";
import { methodNames } from "@/features/applications/domain";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const p = await searchParams;
  const rows = await db
    .select({ app: applications, job: jobs, version: resumeVersions })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(resumeVersions, eq(resumeVersions.id, applications.resumeVersionId))
    .where(
      and(
        p.q ? or(ilike(jobs.company, `%${p.q}%`), ilike(jobs.title, `%${p.q}%`)) : undefined,
        p.view === "applied"
          ? isNotNull(applications.appliedAt)
          : p.view === "offers"
            ? eq(applications.status, "OFFER")
            : p.view === "interviews"
              ? or(
                  eq(applications.status, "RECRUITER_SCREEN"),
                  eq(applications.status, "TECHNICAL_INTERVIEW"),
                  eq(applications.status, "MANAGER_INTERVIEW"),
                  eq(applications.status, "FINAL_INTERVIEW"),
                )
              : undefined,
      ),
    )
    .orderBy(desc(applications.updatedAt));
  const [events, prefs] = await Promise.all([
    db
      .select({ appId: applicationEvents.applicationId })
      .from(applicationEvents)
      .where(eq(applicationEvents.eventType, "OUTREACH_SENT")),
    getDisplayPreferences(),
  ]);
  const sent = new Set(events.map((event) => event.appId));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your applications & outreach"
        description="What you prepared or sent, the file you used, and the latest outcome."
        actions={
          <Button asChild>
            <Link href="/applications/new">Record an application</Link>
          </Button>
        }
      />
      <nav className="flex flex-wrap gap-2" aria-label="Application views">
        {[
          ["", "All records"],
          ["applied", "Applications sent"],
          ["interviews", "Interviews"],
          ["offers", "Offers"],
        ].map(([view, label]) => (
          <Button key={label} variant={(p.view ?? "") === view ? "secondary" : "ghost"} asChild>
            <Link href={`/applications${view ? `?view=${view}` : ""}`}>{label}</Link>
          </Button>
        ))}
      </nav>
      <form className="flex gap-3">
        <input
          name="q"
          type="search"
          aria-label="Search applications"
          defaultValue={p.q}
          placeholder="Company or role"
        />
        <input type="hidden" name="view" value={p.view ?? ""} />
        <Button variant="outline">Search</Button>
      </form>
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map(({ app, job, version }) => (
            <Link
              key={app.id}
              href={`/applications/${app.id}`}
              className="pressable rounded-card border border-border bg-card p-6 text-foreground hover:border-primary hover:no-underline"
            >
              <h2 className="text-lg font-semibold">{job.company}</h2>
              <p className="mt-1">{job.title}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                {methodNames[app.source] || "Application"} ·{" "}
                {app.appliedAt
                  ? app.status.toLowerCase().replaceAll("_", " ")
                  : sent.has(app.id)
                    ? "sent"
                    : "preparing"}
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                Resume: {version?.originalFilename || "No file recorded"}
              </p>
              {app.appliedAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Applied {displayDate(app.appliedAt, prefs)}
                </p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <Panel>
          <h2 className="text-xl font-semibold">No records here yet</h2>
          <p className="mt-2 text-muted-foreground">
            Choose an opening, review your resume, then record the action you took.
          </p>
          <Button asChild className="mt-5">
            <Link href="/find">Find openings</Link>
          </Button>
        </Panel>
      )}
      <Link href="/outreach" className="inline-block text-sm text-link">
        Record a referral, email or LinkedIn message
      </Link>
    </div>
  );
}
