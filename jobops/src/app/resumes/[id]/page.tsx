import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jobs, jobSnapshots } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel } from "@/components/ui";
import { getResume } from "@/features/resumes/service";
import {
  saveAssessment,
  saveChangeNotes,
  selectCurrentVersion,
  toggleArchive,
  uploadVersion,
  retryParsing,
} from "@/features/resumes/actions";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import { indiaDate } from "@/features/mail/attention";
import { methodNames } from "@/features/applications/domain";
export default async function ResumeDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; tab?: string; upload?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [resume, p, prefs, snapshotRows] = await Promise.all([
    getResume(id),
    searchParams,
    getDisplayPreferences(),
    db
      .select({ snapshot: jobSnapshots, job: jobs })
      .from(jobSnapshots)
      .innerJoin(jobs, eq(jobs.id, jobSnapshots.jobId))
      .orderBy(desc(jobSnapshots.capturedAt)),
  ]);
  if (!resume) notFound();
  const version =
    resume.versions.find((file) => file.id === p.version) ??
    resume.versions.find((file) => file.isCurrent) ??
    resume.versions[0];
  const tab = ["file", "changes", "usage", "ats"].includes(p.tab ?? "") ? p.tab! : "file";
  const path = (selectedTab: string, versionId = version?.id) =>
    `/resumes/${id}?${new URLSearchParams({ ...(versionId ? { version: versionId } : {}), tab: selectedTab })}`;
  const usage = resume.usage.filter((record) => record.versionId === version?.id);
  const assessments = resume.assessments.filter(
    (record) => record.assessment.versionId === version?.id,
  );
  const latest = new Map<string, string>();
  for (const row of snapshotRows)
    if (!latest.has(row.job.id)) latest.set(row.job.id, row.snapshot.id);
  return (
    <div className="space-y-6">
      <Link href="/resumes" className="text-sm text-link">
        All resumes
      </Link>
      <PageHeader
        title={resume.name}
        description={`${resume.versions.length} files · Original and revised versions kept separately`}
        actions={
          <Button asChild>
            <Link href={`/resumes/${id}?upload=1#upload-version`}>Upload revised PDF</Link>
          </Button>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title="Your files">
          <div className="space-y-2">
            {resume.versions.map((file) => (
              <Link
                key={file.id}
                href={path(tab, file.id)}
                aria-current={version?.id === file.id ? "page" : undefined}
                className={`pressable block rounded-xl border p-4 text-foreground hover:no-underline ${version?.id === file.id ? "border-primary bg-selected text-selected-foreground" : "border-border hover:bg-muted"}`}
              >
                <strong className="block text-sm">{file.versionLabel}</strong>
                <span className="mt-2 block break-all text-xs text-muted-foreground">
                  {file.originalFilename}
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {displayDate(file.createdAt, prefs)}
                  {file.isCurrent ? " · Default file" : ""}
                </span>
              </Link>
            ))}
          </div>
          {!resume.versions.length && (
            <p className="text-sm text-muted-foreground">Upload a PDF below.</p>
          )}
        </Panel>
        <div className="min-w-0 space-y-5">
          <nav
            className="flex flex-wrap gap-1 rounded-card border border-border bg-card p-3"
            aria-label="Resume details"
          >
            {[
              ["file", "File"],
              ["changes", "Bullet changes"],
              ["usage", "Used for"],
              ["ats", "ATS assessment"],
            ].map(([key, label]) => (
              <Button
                key={key}
                variant={tab === key ? "secondary" : "ghost"}
                className="px-3"
                asChild
              >
                <Link href={path(key)} aria-current={tab === key ? "page" : undefined}>
                  {label}
                </Link>
              </Button>
            ))}
          </nav>
          {version && tab === "file" && (
            <Panel title={`Selected version: ${version.versionLabel}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="break-all text-sm text-muted-foreground">
                  {version.originalFilename} · {(version.fileSize / 1024).toFixed(1)} KB
                </p>
                <Button variant="outline" asChild>
                  <a href={`/api/resumes/${version.id}/file?download=1`}>Download PDF</a>
                </Button>
              </div>
              <iframe
                title={`PDF preview of ${resume.name}, ${version.versionLabel}`}
                src={`/api/resumes/${version.id}/file`}
                className="h-[650px] w-full rounded-xl bg-white"
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Viewer unavailable?{" "}
                <a
                  href={`/api/resumes/${version.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  Open PDF in a new tab
                </a>
                .
              </p>
              <Link
                href={`/resume-prompt?resume=${version.id}`}
                className="mt-5 inline-block text-sm text-link"
              >
                Open a prompt for this file
              </Link>
              {version.parsingError && (
                <details className="mt-5">
                  <summary className="cursor-pointer text-sm font-medium">
                    Text extraction needs attention
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{version.parsingError}</p>
                  <ActionForm key={version.id} action={retryParsing}>
                    <input type="hidden" name="versionId" value={version.id} />
                    <Button variant="outline">Retry text extraction</Button>
                  </ActionForm>
                </details>
              )}
            </Panel>
          )}
          {version && tab === "changes" && (
            <Panel title="Bullet changes">
              <p className="mb-4 text-sm text-muted-foreground">
                Keep the original bullet, revised wording, reason and facts you confirmed with your
                assistant.
              </p>
              <ActionForm key={version.id} action={saveChangeNotes}>
                <input type="hidden" name="versionId" value={version.id} />
                <Field label="Changes for this file" name="changeNotes">
                  <textarea
                    id="changeNotes"
                    name="changeNotes"
                    rows={12}
                    maxLength={20000}
                    defaultValue={version.changeNotes}
                    placeholder={
                      "• Original bullet → revised bullet\n• Why it changed\n• Facts confirmed"
                    }
                  />
                </Field>
                <Button>Save bullet changes</Button>
              </ActionForm>
            </Panel>
          )}
          {version && tab === "usage" && (
            <Panel title="Company and role">
              <p className="mb-4 text-sm text-muted-foreground">
                The exact records linked to {version.originalFilename}.
              </p>
              {usage.length ? (
                <div className="divide-y divide-border">
                  {usage.map((record) => (
                    <Link
                      key={record.id}
                      href={`/applications/${record.id}`}
                      className="block py-4 text-foreground"
                    >
                      <h3 className="font-semibold">{record.company}</h3>
                      <p className="mt-1">{record.title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {methodNames[record.source] || "Application"} ·{" "}
                        {record.appliedAt
                          ? `applied ${displayDate(record.appliedAt, prefs)}`
                          : record.outreachSent
                            ? "sent"
                            : "preparing"}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No application or outreach record uses this file yet.
                </p>
              )}
            </Panel>
          )}
          {version && tab === "ats" && (
            <div className="space-y-5">
              <Panel title="Assessments for this file">
                <p className="mb-5 text-sm text-muted-foreground">
                  Imported estimates for a specific job description. They are separate from keyword
                  coverage and are not employer ATS results.
                </p>
                {!assessments.length && (
                  <p className="text-sm text-muted-foreground">
                    Not assessed yet. Save the assessment from your assistant below.
                  </p>
                )}
                {assessments.map(({ assessment, snapshot, job }) => (
                  <article key={assessment.id} className="mb-4 rounded-xl border border-border p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{job.company}</h3>
                        <p className="text-sm">{job.title}</p>
                      </div>
                      <strong className="text-xl tabular-nums">
                        {assessment.score === null
                          ? "No score provided"
                          : `${assessment.score}/100`}
                      </strong>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {assessment.source} · {displayDate(assessment.assessedAt, prefs)}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm">Method: {assessment.method}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {assessment.findings}
                    </p>
                    {latest.get(job.id) !== snapshot.id && (
                      <p className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                        This assessment uses an earlier job description. It stays linked to the
                        description assessed.
                      </p>
                    )}
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm">Job description assessed</summary>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                        {snapshot.description}
                      </p>
                    </details>
                  </article>
                ))}
              </Panel>
              <Panel title="Save an assessment">
                <ActionForm key={version.id} action={saveAssessment}>
                  <input type="hidden" name="versionId" value={version.id} />
                  <Field label="Job description assessed" name="snapshotId">
                    <select name="snapshotId" id="snapshotId" required defaultValue="">
                      <option value="">Choose the saved description you assessed</option>
                      {snapshotRows
                        .filter((row) => row.snapshot.description.trim())
                        .map(({ snapshot, job }) => (
                          <option key={snapshot.id} value={snapshot.id}>
                            {job.company} — {job.title} ·{" "}
                            {displayDate(snapshot.capturedAt, prefs, true)}
                            {latest.get(job.id) !== snapshot.id ? " (earlier description)" : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Assessed by"
                      name="source"
                      required
                      placeholder="ChatGPT, Claude or your assessment tool"
                    />
                    <Field
                      label="Assessment date (India time)"
                      name="assessedOn"
                      type="date"
                      required
                      defaultValue={indiaDate(new Date())}
                    />
                    <Field
                      label="Score out of 100 (optional)"
                      name="score"
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      placeholder="Leave blank if no score was provided"
                    />
                  </div>
                  <Field
                    label="Scoring method"
                    name="method"
                    required
                    placeholder="The rubric or method used for this estimate"
                  />
                  <Field label="Findings" name="findings">
                    <textarea
                      id="findings"
                      name="findings"
                      rows={5}
                      placeholder="Keyword coverage, formatting issues, missing evidence and useful next edits."
                    />
                  </Field>
                  <Button>Save assessment</Button>
                </ActionForm>
              </Panel>
            </div>
          )}
          {!version && (
            <Panel>
              <p className="text-muted-foreground">Upload the first PDF for this resume below.</p>
            </Panel>
          )}
        </div>
      </div>
      <details
        id="upload-version"
        open={p.upload === "1" || !version}
        className="rounded-card border border-border bg-card p-6"
      >
        <summary className="cursor-pointer font-semibold">Upload another version</summary>
        <div className="mt-5">
          <ActionForm action={uploadVersion}>
            <input type="hidden" name="resumeId" value={id} />
            <Field
              label="Version label"
              name="versionLabel"
              required
              placeholder="Backend role · revised"
            />
            <Field label="PDF file" name="file">
              <input id="file" name="file" type="file" accept="application/pdf,.pdf" required />
            </Field>
            <Field label="Bullet changes with this upload" name="upload-changeNotes">
              <textarea
                id="upload-changeNotes"
                name="changeNotes"
                rows={5}
                placeholder="Paste the change log from your assistant."
              />
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="makeCurrent" defaultChecked />
              Use this as my default file
            </label>
            <Button>Upload PDF</Button>
          </ActionForm>
        </div>
      </details>
      <details className="rounded-card border border-border bg-card p-6">
        <summary className="cursor-pointer text-sm font-medium">
          Default file and archive settings
        </summary>
        <div className="mt-5 space-y-5">
          {version && !version.isCurrent && (
            <ActionForm action={selectCurrentVersion}>
              <input type="hidden" name="versionId" value={version.id} />
              <Button variant="outline">Use this as my default file</Button>
            </ActionForm>
          )}
          <p className="text-sm text-muted-foreground">
            Changing your default does not change the file used in an existing application.
            Archiving keeps every PDF and record.
          </p>
          <ActionForm action={toggleArchive}>
            <input type="hidden" name="resumeId" value={id} />
            <input type="hidden" name="isActive" value={resume.isActive ? "false" : "true"} />
            <Button variant={resume.isActive ? "destructive" : "outline"}>
              {resume.isActive ? "Archive resume" : "Restore resume"}
            </Button>
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
