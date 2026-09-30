import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  jobs,
  jobSnapshots,
  resumeVersions,
  resumes,
  applications,
  contacts,
  missions,
  jobStatuses,
} from "@/db/schema";
import { compareKeywords, groupKeywords } from "@/services/keywords";
import { changeJob, updateJobDescription, compareResumes } from "@/features/jobs/actions";
import { jobTimeline } from "@/features/jobs/service";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Panel, Field, Button, StatusBadge } from "@/components/ui";
import { label } from "@/lib/utils";
export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) notFound();
  const [snapshots, versions, apps, people, work, timeline] = await Promise.all([
    db
      .select()
      .from(jobSnapshots)
      .where(eq(jobSnapshots.jobId, id))
      .orderBy(desc(jobSnapshots.capturedAt)),
    db
      .select({ version: resumeVersions, family: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
      .where(and(eq(resumeVersions.isCurrent, true), eq(resumes.isActive, true))),
    db.select().from(applications).where(eq(applications.jobId, id)),
    db.select().from(contacts).where(ilike(contacts.company, job.company)),
    db.select().from(missions).where(eq(missions.entityId, id)).orderBy(desc(missions.createdAt)),
    jobTimeline(id),
  ]);
  const current = snapshots[0],
    matches = versions
      .map((v) => ({ ...v, ...compareKeywords(current?.skills ?? [], v.version.keywords) }))
      .sort((a, b) => b.score - a.score);
  const missionLink = (type: string) => `/missions/new?type=${type}&entityType=JOB&entityId=${id}`;
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title={job.title}
        description={`${job.company} · ${job.location || "Location unknown"} · ${label(job.workMode)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={job.canonicalUrl} target="_blank" rel="noreferrer">
                Open original job
              </a>
            </Button>
            <Button asChild>
              <Link href={missionLink("APPLY_JOB")}>Create apply mission</Link>
            </Button>
          </>
        }
      />
      <div className="section-links">
        <Link href={missionLink("INSPECT_JOB")}>Create inspect mission</Link>
        <Link href={missionLink("PREPARE_APPLICATION")}>Prepare application</Link>
        <Link href={`/applications/new?jobId=${id}`}>Create application</Link>
        <Link href={missionLink("FIND_CONTACT")}>Find contact mission</Link>
        <Link href={`/contacts?company=${encodeURIComponent(job.company)}`}>Add contact</Link>
      </div>
      <div className="split-layout">
        <div className="stack">
          <Panel title="Job description">
            <dl className="data-list mb-5">
              <dt>Source</dt>
              <dd>{label(job.source)}</dd>
              <dt>Posted</dt>
              <dd>{displayDate(job.postedAt, preferences)}</dd>
              <dt>Experience</dt>
              <dd>
                {job.experienceMin ?? "Unknown"}–{job.experienceMax ?? "Unknown"} years
              </dd>
              <dt>Salary</dt>
              <dd>
                {job.salaryMin !== null || job.salaryMax !== null
                  ? `${job.currency ?? ""} ${job.salaryMin ?? "?"}–${job.salaryMax ?? "?"}`
                  : "Not recorded"}
              </dd>
              <dt>First seen</dt>
              <dd>{displayDate(job.firstSeenAt, preferences)}</dd>
            </dl>
            <p className="whitespace-pre-wrap leading-7">
              {current?.description ||
                "No description saved. Add one below or create an inspect mission."}
            </p>
            {Boolean(current?.requirements.length) && (
              <>
                <h3 className="mt-5">Requirements</h3>
                <ul className="list-disc pl-5">
                  {current.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="mt-5">Job keywords</h3>
            {Object.entries(groupKeywords(current?.skills ?? [])).map(([category, words]) => (
              <div key={category} className="mb-3">
                <p className="mb-1 text-xs text-muted-foreground">{category}</p>
                <div className="chip-list">
                  {words.map((w) => (
                    <span className="chip" key={w}>
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Resume keyword coverage">
            <p className="mb-4 text-sm text-muted-foreground">
              Matched job keywords ÷ all job keywords. This measures text overlap; it does not judge
              suitability or experience.
            </p>
            {!matches.length && <Link href="/resumes">Upload a resume to compare</Link>}
            {matches.map((m) => (
              <div className="mb-4 rounded-lg border border-border p-4" key={m.version.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <Link href={`/resumes/${m.family.id}`}>
                    {m.family.name} / {m.version.versionLabel}
                  </Link>
                  <strong>
                    {current?.skills.length ? `${m.score}% coverage` : "No job keywords"}
                  </strong>
                </div>
                <p className="mt-3 text-sm">
                  <span className="text-emerald-400">Matched:</span>{" "}
                  {m.matched.join(", ") || "None"}
                </p>
                <p className="mt-2 text-sm">
                  <span className="text-amber-400">Missing from resume:</span>{" "}
                  {m.missing.join(", ") || "None"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Resume-only: {m.resumeOnly.join(", ") || "None"}
                </p>
              </div>
            ))}
            <ActionForm action={compareResumes}>
              <input type="hidden" name="id" value={id} />
              <Button variant="outline">Save keyword comparisons</Button>
            </ActionForm>
          </Panel>
          <Panel title="Edit description and keywords">
            <ActionForm action={updateJobDescription}>
              <input type="hidden" name="id" value={id} />
              <Field label="Description" name="description">
                <textarea
                  id="description"
                  name="description"
                  defaultValue={current?.description}
                  rows={7}
                />
              </Field>
              <Field
                label="Keywords (comma separated)"
                name="keywords"
                defaultValue={current?.skills.join(", ")}
              />
              <Field label="Requirements (one per line)" name="requirements">
                <textarea
                  name="requirements"
                  id="requirements"
                  defaultValue={current?.requirements.join("\n")}
                />
              </Field>
              <Button>Save new snapshot</Button>
            </ActionForm>
          </Panel>
          <Panel title={`Snapshot history (${snapshots.length})`}>
            {snapshots.map((s) => (
              <details key={s.id} className="mb-3">
                <summary>
                  {displayDate(s.capturedAt, preferences, true)} · {s.skills.length} keywords
                </summary>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {s.description || "No description"}
                </p>
              </details>
            ))}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Review and notes">
            <ActionForm action={changeJob}>
              <input type="hidden" name="id" value={id} />
              <Field label="Job status" name="status">
                <select id="status" name="status" defaultValue={job.status}>
                  {jobStatuses.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Notes" name="notes">
                <textarea id="notes" name="notes" defaultValue={job.notes} />
              </Field>
              <Button>Save job status</Button>
            </ActionForm>
          </Panel>
          <Panel title="Applications">
            {apps.length ? (
              apps.map((a) => (
                <p className="mb-3" key={a.id}>
                  <Link href={`/applications/${a.id}`}>Open application</Link>{" "}
                  <StatusBadge status={a.status} />
                </p>
              ))
            ) : (
              <p className="muted">No application yet.</p>
            )}
          </Panel>
          <Panel title="Contacts">
            {people.length ? (
              people.map((c) => (
                <p key={c.id} className="mb-3">
                  <Link href={`/contacts/${c.id}`}>{c.name}</Link>
                  <small className="block">{c.title}</small>
                </p>
              ))
            ) : (
              <p className="muted">No contacts recorded for this company.</p>
            )}
          </Panel>
          <Panel title="Mission history">
            {work.length ? (
              work.map((m) => (
                <p className="mb-4" key={m.id}>
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
          <Panel title="Activity">
            <div className="timeline">
              {timeline.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <p>{a.summary}</p>
                  <small>{displayDate(a.createdAt, preferences, true)}</small>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
