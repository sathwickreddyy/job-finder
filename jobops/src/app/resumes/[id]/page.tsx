import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel, StatusBadge } from "@/components/ui";
import {
  editVersionKeywords,
  retryParsing,
  selectCurrentVersion,
  toggleArchive,
  updateResumeFamily,
  uploadVersion,
} from "@/features/resumes/actions";
import { getResume } from "@/features/resumes/service";
import { groupKeywords } from "@/services/keywords";

export const dynamic = "force-dynamic";

export default async function ResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [resume, query] = await Promise.all([getResume(id), searchParams]);
  if (!resume) notFound();
  const version =
    resume.versions.find((item) => item.id === query.version) ??
    resume.versions.find((item) => item.isCurrent) ??
    resume.versions[0];
  const groups = groupKeywords(version?.keywords ?? []);
  const preferences = await getDisplayPreferences();
  return (
    <>
      <Link
        href="/resumes"
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← All resumes
      </Link>
      <PageHeader
        title={resume.name}
        description={`${resume.category} · ${resume.versions.length} PDF versions · ${resume.usage.length} applications`}
        actions={
          <>
            <StatusBadge status={resume.isActive ? "ACTIVE" : "ARCHIVED"} />
            {version && (
              <>
                <Button variant="outline" asChild>
                  <a href="#pdf-preview">Preview PDF</a>
                </Button>
                <Button asChild>
                  <a href={`/api/resumes/${version.id}/file?download=1`}>Download PDF</a>
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {version ? (
            <>
              <Panel title={`Selected version: ${version.versionLabel}`}>
                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                  <StatusBadge status={version.isCurrent ? "CURRENT" : "HISTORICAL"} />
                  <StatusBadge status={version.parsingStatus} />
                  <span className="text-muted-foreground">
                    {version.originalFilename} · {(version.fileSize / 1024).toFixed(1)} KB ·{" "}
                    {displayDate(version.createdAt, preferences, true)}
                  </span>
                </div>
                {version.parsingError && (
                  <div
                    role="status"
                    className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
                  >
                    {version.parsingError}
                  </div>
                )}
                <div id="pdf-preview" className="overflow-hidden rounded-lg border border-border">
                  <iframe
                    title={`PDF preview of ${resume.name}, ${version.versionLabel}`}
                    src={`/api/resumes/${version.id}/file`}
                    className="h-[620px] w-full bg-white"
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  If the browser does not show a PDF viewer,{" "}
                  <a
                    href={`/api/resumes/${version.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    open the PDF in a new tab
                  </a>{" "}
                  or download it.
                </p>
              </Panel>
              <Panel title="Keywords by category">
                <p className="mb-4 text-sm text-muted-foreground">
                  Dictionary detection measures term coverage. It does not infer skill level or
                  verify experience.
                </p>
                {Object.entries(groups).length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {Object.entries(groups).map(([category, keywords]) => (
                      <div key={category}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {category}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {keywords.map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded-md border border-border bg-secondary px-2 py-1 text-xs"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No detected keywords yet. Add accurate terms manually in the form below.
                  </p>
                )}
              </Panel>
              <Panel title="Edit Keywords and Tags">
                <ActionForm action={editVersionKeywords}>
                  <input type="hidden" name="versionId" value={version.id} />
                  <Field
                    label="Keywords"
                    name="keywords"
                    hint="Separate with commas or newlines. Keep terms grounded in the actual document."
                  >
                    <textarea
                      id="keywords"
                      name="keywords"
                      rows={3}
                      defaultValue={version.keywords.join(", ")}
                    />
                  </Field>
                  <Field label="Skills" name="skills">
                    <textarea
                      id="skills"
                      name="skills"
                      rows={2}
                      defaultValue={version.skills.join(", ")}
                    />
                  </Field>
                  <Field label="Experience tags" name="experienceTags">
                    <textarea
                      id="experienceTags"
                      name="experienceTags"
                      rows={2}
                      defaultValue={version.experienceTags.join(", ")}
                      placeholder="Payments, platform operations, mentoring"
                    />
                  </Field>
                  <Field label="Summary" name="summary">
                    <textarea
                      id="summary"
                      name="summary"
                      rows={3}
                      defaultValue={version.summary ?? ""}
                      maxLength={5000}
                    />
                  </Field>
                  <Button>Save Keywords and Tags</Button>
                </ActionForm>
              </Panel>
              <Panel title="Extracted Text">
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    View Extracted Text ({version.extractedText.length.toLocaleString()} characters)
                  </summary>
                  <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary p-4 text-xs leading-relaxed">
                    {version.extractedText ||
                      "No selectable text has been extracted from this file."}
                  </pre>
                </details>
                <div className="mt-4">
                  <ActionForm action={retryParsing}>
                    <input type="hidden" name="versionId" value={version.id} />
                    <Button size="sm" variant="outline">
                      Retry Text Extraction
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Manual keywords and tags are preserved when you retry.
                    </p>
                  </ActionForm>
                </div>
              </Panel>
            </>
          ) : (
            <Panel title="Upload the first version">
              <p className="text-sm text-muted-foreground">
                This family does not contain a PDF yet. Use Upload New Version beside this panel.
              </p>
            </Panel>
          )}
          <Panel title="Applications using this family">
            {resume.usage.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="py-2">Role</th>
                      <th>Resume version</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resume.usage.map((application) => (
                      <tr key={application.id} className="border-t border-border">
                        <td className="py-3">
                          <Link
                            href={`/applications/${application.id}`}
                            className="hover:underline"
                          >
                            {application.company} · {application.title}
                          </Link>
                        </td>
                        <td>
                          {
                            resume.versions.find((item) => item.id === application.versionId)
                              ?.versionLabel
                          }
                        </td>
                        <td>
                          <StatusBadge status={application.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This family has not been selected for an application yet.
              </p>
            )}
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="Upload New Version">
            <ActionForm action={uploadVersion}>
              <input type="hidden" name="resumeId" value={resume.id} />
              <Field
                label="Version label"
                name="versionLabel"
                placeholder={`v${resume.versions.length + 1}`}
                required
                maxLength={80}
              />
              <Field
                label="PDF file"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
                hint="Up to 10 MB. The original PDF is preserved."
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="makeCurrent" defaultChecked /> Make current
              </label>
              <Button>Upload PDF</Button>
            </ActionForm>
          </Panel>
          <Panel title="Version History">
            <div className="space-y-4">
              {resume.versions.length ? (
                resume.versions.map((item) => (
                  <div
                    key={item.id}
                    className="border-b border-border pb-4 last:border-0 last:pb-0"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Link
                        href={`/resumes/${id}?version=${item.id}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {item.versionLabel}
                      </Link>
                      {item.isCurrent && <StatusBadge status="CURRENT" />}
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {displayDate(item.createdAt, preferences, true)} · {item.keywords.length}{" "}
                      keywords
                    </p>
                    <div className="flex gap-3 text-xs">
                      <Link href={`/resumes/${id}?version=${item.id}`} className="underline">
                        View PDF & text
                      </Link>
                      <a href={`/api/resumes/${item.id}/file?download=1`} className="underline">
                        Download
                      </a>
                    </div>
                    {!item.isCurrent && (
                      <div className="mt-3">
                        <ActionForm action={selectCurrentVersion}>
                          <input type="hidden" name="versionId" value={item.id} />
                          <Button size="sm" variant="outline">
                            Set Current Version
                          </Button>
                        </ActionForm>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No versions uploaded.</p>
              )}
            </div>
          </Panel>
          <Panel title="Family Details">
            <ActionForm action={updateResumeFamily}>
              <input type="hidden" name="resumeId" value={resume.id} />
              <Field
                label="Name"
                name="name"
                defaultValue={resume.name}
                required
                minLength={2}
                maxLength={100}
              />
              <Field
                label="Category"
                name="category"
                defaultValue={resume.category}
                required
                maxLength={80}
              />
              <Field label="Description" name="description">
                <textarea
                  id="description"
                  name="description"
                  defaultValue={resume.description}
                  rows={3}
                  maxLength={2000}
                />
              </Field>
              <Button variant="outline">Save Family</Button>
            </ActionForm>
            <div className="mt-5 border-t border-border pt-4">
              <ActionForm action={toggleArchive}>
                <input type="hidden" name="resumeId" value={resume.id} />
                <input type="hidden" name="isActive" value={String(!resume.isActive)} />
                <Button variant="outline">
                  {resume.isActive ? "Archive Family" : "Restore Family"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Archiving keeps all files and application references.
                </p>
              </ActionForm>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
