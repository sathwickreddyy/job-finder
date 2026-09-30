import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  jobs,
  applications,
  profiles,
  missions,
  mailEvents,
  mailMessages,
  activityLogs,
  candidateProfiles,
} from "@/db/schema";
import { PageHeader, Panel, Button, StatusBadge } from "@/components/ui";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
export default async function Today() {
  const preferences = await getDisplayPreferences();
  const dateLabel = (value: Date | null | undefined) => displayDate(value, preferences);
  const now = new Date(),
    stale = new Date(new Date().getTime() - 30 * 86400000);
  const [
    newJobs,
    shortlisted,
    ready,
    followups,
    openMissions,
    reviewMissions,
    mailReview,
    staleProfiles,
    interviews,
    recentMail,
    activity,
    candidate,
    naukriProfiles,
  ] = await Promise.all([
    db.select({ n: count() }).from(jobs).where(eq(jobs.status, "NEW")),
    db.select({ n: count() }).from(jobs).where(eq(jobs.status, "SHORTLISTED")),
    db.select({ n: count() }).from(applications).where(eq(applications.status, "READY_FOR_REVIEW")),
    db
      .select({ app: applications, job: jobs })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(
        and(
          lte(applications.nextActionAt, now),
          sql`${applications.status} not in ('REJECTED','WITHDRAWN','CLOSED','OFFER')`,
        ),
      )
      .orderBy(applications.nextActionAt)
      .limit(10),
    db
      .select()
      .from(missions)
      .where(inArray(missions.status, ["DRAFT", "READY", "IN_PROGRESS", "WAITING_FOR_USER"]))
      .orderBy(missions.priority, desc(missions.createdAt))
      .limit(10),
    db.select({ n: count() }).from(missions).where(eq(missions.status, "READY_FOR_REVIEW")),
    db.select({ n: count() }).from(mailEvents).where(eq(mailEvents.status, "NEEDS_REVIEW")),
    db
      .select()
      .from(profiles)
      .where(or(sql`${profiles.lastInspectedAt} is null`, lte(profiles.lastInspectedAt, stale)))
      .limit(10),
    db
      .select({ app: applications, job: jobs })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(
        and(
          inArray(applications.status, [
            "RECRUITER_SCREEN",
            "TECHNICAL_INTERVIEW",
            "MANAGER_INTERVIEW",
            "FINAL_INTERVIEW",
          ]),
          gte(applications.nextActionAt, now),
        ),
      )
      .orderBy(applications.nextActionAt)
      .limit(10),
    db.select().from(mailMessages).orderBy(desc(mailMessages.receivedAt)).limit(5),
    db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(10),
    db.select().from(candidateProfiles).limit(1),
    db
      .select()
      .from(profiles)
      .where(eq(profiles.provider, "NAUKRI"))
      .orderBy(profiles.createdAt)
      .limit(1),
  ]);
  const queues = [
    {
      title: "New jobs awaiting review",
      detail: "Check the source, requirements and fit.",
      n: newJobs[0].n,
      url: "/jobs?status=NEW",
    },
    {
      title: "Shortlisted roles",
      detail: "Choose the next application to prepare.",
      n: shortlisted[0].n,
      url: "/jobs?status=SHORTLISTED",
    },
    {
      title: "Applications ready for review",
      detail: "Review prepared forms before final submission.",
      n: ready[0].n,
      url: "/applications?status=READY_FOR_REVIEW",
    },
    {
      title: "Mail updates needing review",
      detail: "Confirm recruiting updates before changing a stage.",
      n: mailReview[0].n,
      url: "/mail?review=1",
    },
    {
      title: "Missions awaiting your review",
      detail: "Read the result and evidence.",
      n: reviewMissions[0].n,
      url: "/missions?status=READY_FOR_REVIEW",
    },
  ];
  return (
    <>
      <PageHeader
        title="Today"
        description={`${dateLabel(now)} · A focused plan for your next career move.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/jobs/new">Add job</Link>
            </Button>
            <Button asChild>
              <Link href="/missions/new?type=DISCOVER_JOBS">Find today’s jobs</Link>
            </Button>
          </>
        }
      />
      {candidate[0]?.metadata.isDemo === true && (
        <div className="notice mb-6">
          You are viewing fictional demo data. Update Candidate Profile with your own information
          before preparing real applications. Unknown answers remain explicit.
        </div>
      )}
      <div className="split-layout">
        <div className="stack">
          <Panel title="Your review queues">
            {queues.map((q) => (
              <Link
                href={q.url}
                key={q.title}
                className="queue-row"
                style={{ color: "var(--foreground)", textDecoration: "none" }}
              >
                <div>
                  <strong>{q.title}</strong>
                  <p className="text-xs text-muted-foreground">{q.detail}</p>
                </div>
                <span className="queue-count">{q.n}</span>
              </Link>
            ))}
          </Panel>
          <Panel title="Open missions">
            {openMissions.length ? (
              openMissions.map((m) => (
                <div className="queue-row" key={m.id}>
                  <div>
                    <Link className="cell-title" href={`/missions/${m.id}`}>
                      {m.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{dateLabel(m.createdAt)}</p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))
            ) : (
              <p className="muted">
                No open missions. Create a discovery or profile inspection mission to start.
              </p>
            )}
            <div className="actions mt-5">
              <Link className="button-secondary" href="/missions/new?type=DISCOVER_JOBS">
                Create discovery mission
              </Link>
              <Link className="button-quiet" href="/missions">
                View all missions
              </Link>
            </div>
          </Panel>
          <Panel title="Recent activity">
            <div className="timeline">
              {activity.length ? (
                activity.map((a) => (
                  <article key={a.id} className="timeline-item">
                    <p>{a.summary}</p>
                    <small>{dateLabel(a.createdAt)}</small>
                  </article>
                ))
              ) : (
                <p className="muted">Your activity will appear as you add and review records.</p>
              )}
            </div>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Follow-ups due">
            {followups.length ? (
              followups.map(({ app, job }) => (
                <div className="mb-4" key={app.id}>
                  <Link href={`/applications/${app.id}`}>
                    {job.company} — {job.title}
                  </Link>
                  <small className="block">Due {dateLabel(app.nextActionAt)}</small>
                </div>
              ))
            ) : (
              <p className="muted">No follow-ups due. Set a next action date on an application.</p>
            )}
            <Link className="button-secondary mt-3" href="/applications?followup=due">
              View follow-ups
            </Link>
          </Panel>
          <Panel title="Upcoming interviews">
            {interviews.length ? (
              interviews.map(({ app, job }) => (
                <div className="mb-4" key={app.id}>
                  <Link href={`/applications/${app.id}`}>
                    {job.company} — {job.title}
                  </Link>
                  <small className="block">{dateLabel(app.nextActionAt)}</small>
                  <StatusBadge status={app.status} />
                </div>
              ))
            ) : (
              <p className="muted">No interview dates recorded.</p>
            )}
          </Panel>
          <Panel title="Profiles to inspect">
            <Link
              className="button-secondary mb-4"
              href={
                naukriProfiles[0]
                  ? `/missions/new?type=INSPECT_PROFILE&entityType=PROFILE&entityId=${naukriProfiles[0].id}`
                  : "/profiles/new"
              }
            >
              {naukriProfiles[0] ? "Inspect Naukri profile" : "Add Naukri profile"}
            </Link>
            {staleProfiles.length ? (
              staleProfiles.map((p) => (
                <div className="mb-4" key={p.id}>
                  <Link href={`/profiles/${p.id}`}>{p.displayName}</Link>
                  <small className="block">Last inspection: {dateLabel(p.lastInspectedAt)}</small>
                  <Link
                    className="button-quiet mt-1"
                    href={`/missions/new?type=INSPECT_PROFILE&entityType=PROFILE&entityId=${p.id}`}
                  >
                    Inspect {p.displayName}
                  </Link>
                </div>
              ))
            ) : (
              <p className="muted">Profiles inspected within the last 30 days.</p>
            )}
            <Link className="button-secondary mt-2" href="/missions/new?type=UPDATE_PROFILE">
              Create profile update mission
            </Link>
          </Panel>
          <Panel title="Recent recruiting mail">
            {recentMail.length ? (
              recentMail.map((m) => (
                <div className="mb-4" key={m.id}>
                  <Link href={`/mail/${m.id}`}>{m.subject}</Link>
                  <small className="block">
                    {m.sender} · {dateLabel(m.receivedAt)}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">Import messages or configure Gmail read-only in Settings.</p>
            )}
            <Link className="button-secondary" href="/mail?review=1">
              Review mail updates
            </Link>
          </Panel>
        </div>
      </div>
    </>
  );
}
