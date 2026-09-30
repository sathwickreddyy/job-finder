import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  applications,
  jobs,
  resumes,
  resumeVersions,
  applicationEvents,
  mailMessages,
  missions,
  contacts,
} from "@/db/schema";
import { PageHeader, Panel, Button, StatusBadge, Field } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { ApplicationForm } from "@/features/applications/form";
import { addApplicationNote } from "@/features/applications/actions";
import { label } from "@/lib/utils";
export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [record] = await db
    .select({ app: applications, job: jobs })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(applications.id, id))
    .limit(1);
  if (!record) notFound();
  const { app, job } = record;
  const [versions, events, mail, work, people] = await Promise.all([
    db
      .select({ version: resumeVersions, family: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id)),
    db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.occurredAt)),
    db
      .select()
      .from(mailMessages)
      .where(eq(mailMessages.linkedApplicationId, id))
      .orderBy(desc(mailMessages.receivedAt)),
    db
      .select()
      .from(missions)
      .where(or(eq(missions.entityId, id), eq(missions.entityId, job.id)))
      .orderBy(desc(missions.createdAt)),
    db.select().from(contacts).where(ilike(contacts.company, job.company)),
  ]);
  const selected = versions.find((v) => v.version.id === app.resumeVersionId);
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title={`${job.company} application`}
        description={job.title}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/jobs/${job.id}`}>Open job</Link>
            </Button>
            {app.applicationUrl && (
              <Button asChild>
                <a href={app.applicationUrl} target="_blank" rel="noreferrer">
                  Open application
                </a>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <StatusBadge status={app.status} />
        <span className="text-muted-foreground">
          Applied: {displayDate(app.appliedAt, preferences)}
        </span>
        {selected && (
          <a
            className="button-secondary"
            href={`/api/resumes/${selected.version.id}/file?download=1`}
          >
            Download selected resume
          </a>
        )}
        <Link href={`/missions/new?type=FOLLOW_UP_REVIEW&entityType=APPLICATION&entityId=${id}`}>
          Create follow-up review mission
        </Link>
      </div>
      <div className="split-layout">
        <div className="stack">
          <Panel title="Application details">
            <ApplicationForm
              existing={app}
              jobChoices={[{ id: job.id, label: `${job.company} — ${job.title}` }]}
              versionChoices={versions.map((v) => ({
                id: v.version.id,
                label: `${v.family.name} / ${v.version.versionLabel}`,
              }))}
            />
          </Panel>
          <Panel title="Timeline">
            <div className="timeline">
              {events.map((e) => (
                <article key={e.id} className="timeline-item">
                  <h3>{label(e.eventType)}</h3>
                  <p>{e.summary}</p>
                  <small>
                    {displayDate(e.occurredAt, preferences, true)} · {label(e.source)}
                  </small>
                  {Object.keys(e.payload).length > 0 && (
                    <details>
                      <summary className="text-xs">Event data</summary>
                      <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
            <ActionForm action={addApplicationNote}>
              <input type="hidden" name="id" value={id} />
              <Field label="Timeline note" name="summary">
                <textarea id="summary" name="summary" required />
              </Field>
              <Button variant="outline">Add timeline note</Button>
            </ActionForm>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Recruiting mail">
            {mail.length ? (
              mail.map((m) => (
                <p className="mb-4" key={m.id}>
                  <Link href={`/mail/${m.id}`}>{m.subject}</Link>
                  <small className="block">{displayDate(m.receivedAt, preferences, true)}</small>
                </p>
              ))
            ) : (
              <p className="muted">Link imported mail to this application from Mail.</p>
            )}
          </Panel>
          <Panel title="Related missions">
            {work.length ? (
              work.map((m) => (
                <p key={m.id} className="mb-4">
                  <Link href={`/missions/${m.id}`}>{m.title}</Link>
                  <span className="mt-1 block">
                    <StatusBadge status={m.status} />
                  </span>
                </p>
              ))
            ) : (
              <p className="muted">No missions yet.</p>
            )}
          </Panel>
          <Panel title="Company contacts">
            {people.length ? (
              people.map((c) => (
                <p key={c.id}>
                  <Link href={`/contacts/${c.id}`}>{c.name}</Link>
                  <small className="block">{c.title}</small>
                </p>
              ))
            ) : (
              <Link href={`/contacts?company=${encodeURIComponent(job.company)}`}>Add contact</Link>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
