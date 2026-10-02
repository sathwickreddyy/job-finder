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
  retryParsing,
} from "@/features/resumes/actions";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import { indiaDate } from "@/features/mail/attention";
import { resumePresentation } from "@/features/resumes/presentation";
import {
  DefaultBadge,
  FileMark,
  PdfPreview,
  UseBadge,
  UsagePanel,
} from "@/features/resumes/file-ui";
import { ResumeUploadDrawer } from "@/features/resumes/upload-drawer";
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
  const tab = ["file", "changes", "usage", "ats"].includes(p.tab ?? "") ? p.tab! : "usage";
  const path = (selectedTab: string, versionId = version?.id) =>
    `/resumes/${id}?${new URLSearchParams({ ...(versionId ? { version: versionId } : {}), tab: selectedTab })}`;
  const presentation = resumePresentation(resume, prefs);
  const selectedFile = presentation.files.find((file) => file.id === version?.id);
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
      <p className="text-sm text-muted-foreground">
        {resume.name}
        {resume.isActive ? "" : " · Archived"}
      </p>
      <PageHeader
        title={version?.versionLabel ?? resume.name}
        description={version?.originalFilename ?? "Upload your first PDF"}
        actions={
          <div className="flex flex-wrap gap-2">
            {version && (
              <Button variant="outline" asChild>
                <a href={`/api/resumes/${version.id}/file?download=1`}>Download PDF</a>
              </Button>
            )}
            <ResumeUploadDrawer
              key={`${p.version ?? "default"}-${p.upload ?? "closed"}`}
              families={[{ id, name: resume.name }]}
              familyId={id}
              initialOpen={p.upload === "1" || !version}
              label="Upload revised PDF"
            />
          </div>
        }
      />
      {selectedFile && (
        <div className="flex flex-wrap gap-2">
          <UseBadge file={selectedFile} />
          {selectedFile.isDefault && <DefaultBadge />}
        </div>
      )}
      <div className="grid overflow-hidden rounded-panel border border-border bg-card shadow-surface lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          aria-label="Resume versions"
          className="border-b border-border bg-rail/50 p-4 lg:border-b-0 lg:border-r"
        >
          <p className="mb-4 px-2 text-xs text-muted-foreground">Choose a file</p>
          <div className="space-y-2">
            {resume.versions.map((file) => (
              <Link
                key={file.id}
                href={path(tab, file.id)}
                aria-current={version?.id === file.id ? "page" : undefined}
                className={`pressable flex gap-3 rounded-2xl border p-3 text-foreground hover:no-underline ${version?.id === file.id ? "border-primary bg-selected text-selected-foreground" : "border-border hover:bg-muted"}`}
              >
                <FileMark compact />
                <span className="min-w-0">
                  <strong className="block text-xs leading-relaxed">{file.versionLabel}</strong>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {displayDate(file.createdAt, prefs)}
                    {file.isCurrent ? " · Default file" : ""}
                  </span>
                  <span className="mt-2 block text-[11px]">
                    {resume.usage.filter((record) => record.versionId === file.id).length} linked
                    record
                    {resume.usage.filter((record) => record.versionId === file.id).length === 1
                      ? ""
                      : "s"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          {!resume.versions.length && (
            <p className="text-sm text-muted-foreground">
              Use Upload revised PDF to add your first file.
            </p>
          )}
        </aside>
        <div className="min-w-0 space-y-5 p-5 sm:p-6">
          <nav
            className="flex flex-wrap gap-1 rounded-full bg-rail p-1"
            aria-label="Resume details"
          >
            {[
              ["usage", "Applications"],
              ["file", "PDF preview"],
              ["changes", "Changes and assessments"],
            ].map(([key, label]) => (
              <Button
                key={key}
                variant={
                  tab === key || (tab === "ats" && key === "changes") ? "secondary" : "ghost"
                }
                className={`min-h-10 flex-1 rounded-full px-3 text-xs ${tab === key || (tab === "ats" && key === "changes") ? "bg-selected text-selected-foreground hover:bg-selected/80" : ""}`}
                asChild
              >
                <Link
                  href={path(key)}
                  aria-current={
                    tab === key || (tab === "ats" && key === "changes") ? "page" : undefined
                  }
                >
                  {label}
                </Link>
              </Button>
            ))}
          </nav>
          {version && tab === "file" && (
            <div>
              {selectedFile && <PdfPreview file={selectedFile} height="h-[650px]" />}
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
            </div>
          )}
          {version && (tab === "changes" || tab === "ats") && (
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
          {selectedFile && tab === "usage" && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Applications and outreach linked to this exact PDF.
              </p>
              <UsagePanel file={selectedFile} timeline />
              <details className="border-t border-border pt-5">
                <summary className="text-sm font-medium">
                  Bullet changes{version?.changeNotes ? "" : " · none recorded"}
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {version?.changeNotes || "No changes recorded for this version."}
                </p>
              </details>
              <p className="text-xs text-muted-foreground">
                {selectedFile.textExtracted
                  ? "Selectable text extracted"
                  : "Text extraction needs review"}{" "}
                ·{" "}
                {assessments.length
                  ? `${assessments.length} saved assessments`
                  : "No ATS assessment recorded"}
              </p>
            </div>
          )}
          {version && (tab === "changes" || tab === "ats") && (
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
              <p className="text-muted-foreground">
                Use Upload revised PDF to add your first file.
              </p>
            </Panel>
          )}
        </div>
      </div>
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
