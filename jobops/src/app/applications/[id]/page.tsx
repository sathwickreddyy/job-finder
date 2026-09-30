import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  applications,
  jobs,
  resumes,
  resumeVersions,
  applicationEvents,
  mailMessages,
} from "@/db/schema";
import { PageHeader, Panel, Button, StatusBadge, Field } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { ApplicationForm } from "@/features/applications/form";
import { addApplicationNote } from "@/features/applications/actions";
import { methodNames } from "@/features/applications/domain";
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
  const [versions, events, mail] = await Promise.all([
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
  ]);
  const outreach = ["REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"].includes(app.source);
  const sent = events.some((event) => event.eventType === "OUTREACH_SENT");
  const selected = versions.find((v) => v.version.id === app.resumeVersionId);
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title={`${job.company} · ${methodNames[app.source] || "Application"}`}
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
        {outreach ? (
          <span className="rounded-full bg-selected px-3 py-1 text-sm text-selected-foreground">
            {sent ? "Sent" : "Preparing"}
          </span>
        ) : (
          <StatusBadge status={app.status} />
        )}
        <span className="text-muted-foreground">
          {app.appliedAt ? `Applied: ${displayDate(app.appliedAt, preferences)}` : ""}
        </span>
        {selected && (
          <a
            className="button-secondary"
            href={`/api/resumes/${selected.version.id}/file?download=1`}
          >
            Download selected resume
          </a>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="stack">
          <Panel title="Application details">
            {outreach ? (
              <p className="text-sm text-muted-foreground">
                {sent
                  ? "Your outreach is recorded as sent. Add replies or follow-up notes below."
                  : "This outreach is a plan. After sending, record it from the outreach page."}{" "}
                <Link href={`/outreach?job=${job.id}&method=${app.source}`} className="text-link">
                  Open outreach prompt
                </Link>{" "}
                ·{" "}
                <Link href={`/applications/new?jobId=${job.id}`} className="text-link">
                  Record a direct application
                </Link>
              </p>
            ) : (
              <ApplicationForm
                existing={app}
                jobChoices={[{ id: job.id, label: `${job.company} — ${job.title}` }]}
                versionChoices={versions.map((v) => ({
                  id: v.version.id,
                  label: `${v.family.name} / ${v.version.versionLabel}`,
                }))}
              />
            )}
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
                  {typeof e.payload.recipient === "string" && e.payload.recipient && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Recipient: {e.payload.recipient}
                    </p>
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
        </div>
      </div>
    </>
  );
}
