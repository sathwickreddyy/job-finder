import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Download, FileText, MoreVertical } from "lucide-react";
import { db } from "@/db";
import { jobs, jobSnapshots } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import { indiaDate } from "@/features/mail/attention";
import {
  retryParsing,
  saveAssessment,
  saveChangeNotes,
  selectCurrentVersion,
  toggleArchive,
} from "@/features/resumes/actions";
import { PdfPreview } from "@/features/resumes/file-ui";
import { resumePresentation } from "@/features/resumes/presentation";
import { getResume, listResumes } from "@/features/resumes/service";
import { ResumeUploadDrawer } from "@/features/resumes/upload-drawer";
import { DetailSection, FileHeader, UsedFor } from "@/features/resumes/workspace/pane";
import { ResumeRail } from "@/features/resumes/workspace/rail";
import { cn } from "@/lib/utils";

type Params = {
  file?: string;
  resume?: string;
  archived?: string;
  upload?: string;
  section?: string;
};
type Resume = NonNullable<Awaited<ReturnType<typeof getResume>>>;

export default async function Resumes({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const includeArchived = p.archived === "1";
  const [summaries, prefs] = await Promise.all([listResumes("", true), getDisplayPreferences()]);
  const details = (await Promise.all(summaries.map((family) => getResume(family.id)))).filter(
    (family): family is Resume => Boolean(family),
  );
  const families = details.map((family) => resumePresentation(family, prefs));
  const requested = families.flatMap((family) => family.files).find((file) => file.id === p.file);
  const chosenFamily = families.find((family) => family.id === (requested?.familyId ?? p.resume));
  const visible = families.filter(
    (family) => includeArchived || !family.isArchived || family.id === chosenFamily?.id,
  );
  const raw = (id?: string) => details.find((family) => family.id === id);
  const visibleFiles = visible.flatMap((family) => family.files);
  const file =
    requested ??
    (chosenFamily
      ? (chosenFamily.files.find(
          (item) => raw(chosenFamily.id)?.versions.find((v) => v.id === item.id)?.isCurrent,
        ) ?? chosenFamily.files[0])
      : (visibleFiles.find((item) => item.isDefault) ?? visibleFiles[0]));
  const family = chosenFamily ?? visible.find((item) => item.id === file?.familyId);
  const resume = raw(family?.id);
  const version = resume?.versions.find((item) => item.id === file?.id);
  const hasSelection = Boolean(p.file || p.resume);
  // Drawers remount (and close) when the URL selection changes, e.g. after an upload redirect,
  // but not when an action's revalidation changes which file is the default.
  const selection = p.file ?? p.resume ?? "default";
  const upload = p.upload === "1";
  const base = includeArchived ? "/resumes?archived=1&" : "/resumes?";
  const toggleArchived = new URLSearchParams();
  if (!includeArchived) toggleArchived.set("archived", "1");
  if (p.file) toggleArchived.set("file", p.file);
  else if (p.resume) toggleArchived.set("resume", p.resume);
  const activeFamilies = visible
    .filter((item) => !item.isArchived)
    .map(({ id, name }) => ({ id, name }));

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Your resumes</h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Every PDF version, where it was sent and what changed.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/resume-prompt">Tailor a resume for a role</Link>
          <Link href={`/resumes${toggleArchived.toString() ? `?${toggleArchived}` : ""}`}>
            {includeArchived ? "Hide archived resumes" : "Include archived resumes"}
          </Link>
        </div>
      </header>
      <div className="grid overflow-hidden rounded-panel border border-border bg-card shadow-surface lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside
          className={cn("border-border bg-rail/60 lg:border-r", hasSelection && "hidden lg:block")}
        >
          <ResumeRail
            families={visible}
            selectedId={file?.id}
            selectedFamilyId={family?.id}
            variant="lineage"
            linkBase={base}
            action={
              <ResumeUploadDrawer
                key={`rail-${selection}-${upload}`}
                families={activeFamilies}
                initialOpen={upload && !chosenFamily}
                className="w-full !min-h-10"
              />
            }
          />
        </aside>
        <div
          data-resume-id={family?.id}
          className={cn("min-w-0 p-5 sm:p-6", !hasSelection && "hidden lg:block")}
        >
          <Link
            href={includeArchived ? "/resumes?archived=1" : "/resumes"}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium lg:hidden"
          >
            <ArrowLeft size={15} aria-hidden />
            All files
          </Link>
          {!family || !resume ? (
            <div className="grid min-h-[420px] place-items-center text-center">
              <div className="max-w-sm">
                <FileText
                  size={32}
                  strokeWidth={1.4}
                  className="mx-auto mb-4 text-muted-foreground"
                  aria-hidden
                />
                <h2 className="m-0 text-lg font-semibold">Upload your first resume</h2>
                <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
                  Start with your original PDF. Revisions branch from it, and each application keeps
                  the exact file it used.
                </p>
              </div>
            </div>
          ) : !file || !version ? (
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="m-0 text-xs text-muted-foreground">
                  {family.isArchived ? "Archived resume" : "Resume"}
                </p>
                <h2 className="m-0 mt-1.5 text-xl font-semibold tracking-tight">{family.name}</h2>
                <p className="m-0 mt-2 text-sm text-muted-foreground">No PDF uploaded yet.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ResumeUploadDrawer
                  key={`first-${selection}-${upload}`}
                  families={[{ id: family.id, name: family.name }]}
                  familyId={family.id}
                  initialOpen={upload}
                  label="Upload its first PDF"
                  className="!min-h-10 !px-4"
                />
                <FileMenu resume={resume} />
              </div>
            </header>
          ) : (
            <>
              <FileHeader
                file={file}
                actions={
                  <>
                    <Button variant="outline" size="lg" className="!h-10 !px-4" asChild>
                      <a href={`/api/resumes/${file.id}/file?download=1`}>
                        <Download size={15} aria-hidden />
                        Download
                      </a>
                    </Button>
                    <ResumeUploadDrawer
                      key={`file-${selection}-${upload}`}
                      families={[{ id: family.id, name: family.name }]}
                      familyId={family.id}
                      initialOpen={upload && Boolean(chosenFamily)}
                      label="Upload revision"
                      className="!min-h-10 !px-4"
                    />
                    <FileMenu key={file.id} resume={resume} version={version} />
                  </>
                }
              />
              <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_288px]">
                <div className="min-w-0 xl:sticky xl:top-4">
                  <PdfPreview file={file} height="h-[520px] sm:h-[700px]" />
                </div>
                <div className="min-w-0 rounded-3xl bg-rail px-5 pt-5">
                  <UsedFor file={file} className="pb-2" />
                  <div className="mt-3 border-t border-border">
                    <DetailSection
                      title="Bullet changes"
                      status={version.changeNotes ? "Recorded" : "None recorded"}
                      defaultOpen={p.section === "changes"}
                    >
                      <ActionForm key={version.id} action={saveChangeNotes}>
                        <input type="hidden" name="versionId" value={version.id} />
                        <Field label="Changes for this file" name="changeNotes">
                          <textarea
                            id="changeNotes"
                            name="changeNotes"
                            rows={8}
                            maxLength={20000}
                            defaultValue={version.changeNotes}
                            placeholder={
                              "• Original bullet → revised bullet\n• Why it changed\n• Facts confirmed"
                            }
                          />
                        </Field>
                        <Button size="lg" className="!h-10 !px-4">
                          Save bullet changes
                        </Button>
                      </ActionForm>
                    </DetailSection>
                    <Assessments
                      resume={resume}
                      versionId={version.id}
                      open={p.section === "assessments"}
                      prefs={prefs}
                    />
                    {version.parsingError && (
                      <DetailSection title="Text extraction needs attention" status="Review">
                        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                          {version.parsingError}
                        </p>
                        <ActionForm key={version.id} action={retryParsing} className="mt-4">
                          <input type="hidden" name="versionId" value={version.id} />
                          <Button variant="outline" size="lg" className="!h-10 !px-4">
                            Retry text extraction
                          </Button>
                        </ActionForm>
                      </DetailSection>
                    )}
                  </div>
                  <p className="m-0 border-t border-border py-4 text-sm">
                    <Link href={`/resume-prompt?resume=${version.id}`}>
                      Tailor this file for a role
                    </Link>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FileMenu({ resume, version }: { resume: Resume; version?: Resume["versions"][number] }) {
  return (
    <details className="relative">
      <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full !p-0 hover:bg-muted [&::-webkit-details-marker]:hidden">
        <MoreVertical size={18} aria-hidden />
        <span className="sr-only">More file actions</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-64 space-y-1 rounded-2xl border border-border bg-popover p-2 shadow-surface">
        {version && !version.isCurrent && resume.isActive && (
          <ActionForm key="default" action={selectCurrentVersion} className="space-y-2">
            <input type="hidden" name="versionId" value={version.id} />
            <button className="block w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted">
              Use as default for new applications
            </button>
          </ActionForm>
        )}
        <ActionForm key="archive" action={toggleArchive} className="space-y-2">
          <input type="hidden" name="resumeId" value={resume.id} />
          <input type="hidden" name="isActive" value={resume.isActive ? "false" : "true"} />
          <button
            className={cn(
              "block w-full rounded-xl px-3 py-2.5 text-left text-sm",
              resume.isActive ? "text-destructive hover:bg-danger-soft" : "hover:bg-muted",
            )}
          >
            {resume.isActive ? "Archive this resume" : "Restore this resume"}
          </button>
        </ActionForm>
        <p className="m-0 px-3 pb-1 pt-1 text-[11px] leading-relaxed text-muted-foreground">
          Archiving keeps every PDF and the applications that used them. Changing the default never
          changes a submitted application.
        </p>
      </div>
    </details>
  );
}

async function Assessments({
  resume,
  versionId,
  open,
  prefs,
}: {
  resume: Resume;
  versionId: string;
  open: boolean;
  prefs: Awaited<ReturnType<typeof getDisplayPreferences>>;
}) {
  const snapshotRows = await db
    .select({ snapshot: jobSnapshots, job: jobs })
    .from(jobSnapshots)
    .innerJoin(jobs, eq(jobs.id, jobSnapshots.jobId))
    .orderBy(desc(jobSnapshots.capturedAt));
  const latest = new Map<string, string>();
  for (const row of snapshotRows)
    if (!latest.has(row.job.id)) latest.set(row.job.id, row.snapshot.id);
  const assessments = resume.assessments.filter(
    (record) => record.assessment.versionId === versionId,
  );
  return (
    <DetailSection
      title="Assessments"
      status={assessments.length ? `${assessments.length} saved` : "None yet"}
      defaultOpen={open}
    >
      <p className="m-0 mb-4 text-xs leading-relaxed text-muted-foreground">
        Estimates from your assistant for one saved job description. They are not employer ATS
        results.
      </p>
      {assessments.map(({ assessment, snapshot, job }) => (
        <article key={assessment.id} className="mb-3 rounded-2xl bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold">{job.company}</p>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">{job.title}</p>
            </div>
            <strong className="shrink-0 tabular-nums">
              {assessment.score === null ? "No score provided" : `${assessment.score}/100`}
            </strong>
          </div>
          <p className="m-0 mt-2 text-[11px] text-muted-foreground">
            {assessment.source}, {displayDate(assessment.assessedAt, prefs)}
          </p>
          <p className="m-0 mt-2 whitespace-pre-wrap text-xs">Method: {assessment.method}</p>
          {assessment.findings && (
            <p className="m-0 mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {assessment.findings}
            </p>
          )}
          {latest.get(job.id) !== snapshot.id && (
            <p className="m-0 mt-3 rounded-xl bg-warning-soft p-3 text-xs text-warning">
              This assessment uses an earlier job description. It stays linked to the description
              assessed.
            </p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer !p-0 text-xs">Job description assessed</summary>
            <p className="m-0 mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {snapshot.description}
            </p>
          </details>
        </article>
      ))}
      <h4 className="m-0 mb-3 mt-5 text-sm font-semibold">Save an assessment</h4>
      <ActionForm key={versionId} action={saveAssessment}>
        <input type="hidden" name="versionId" value={versionId} />
        <Field label="Job description assessed" name="snapshotId">
          <select name="snapshotId" id="snapshotId" required defaultValue="">
            <option value="">Choose the saved description</option>
            {snapshotRows
              .filter((row) => row.snapshot.description.trim())
              .map(({ snapshot, job }) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {job.company} — {job.title} · {displayDate(snapshot.capturedAt, prefs, true)}
                  {latest.get(job.id) !== snapshot.id ? " (earlier description)" : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Assessed by" name="source" required placeholder="ChatGPT, Claude or a tool" />
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
          placeholder="Blank if none given"
        />
        <Field label="Scoring method" name="method" required placeholder="Rubric or method used" />
        <Field label="Findings" name="findings">
          <textarea
            id="findings"
            name="findings"
            rows={4}
            placeholder="Keyword coverage, formatting issues, missing evidence and next edits."
          />
        </Field>
        <Button size="lg" className="!h-10 !px-4">
          Save assessment
        </Button>
      </ActionForm>
    </DetailSection>
  );
}
