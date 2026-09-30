import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Button, EmptyState, Field, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { createResumeFamily, uploadVersion } from "@/features/resumes/actions";
import { listResumes } from "@/features/resumes/service";

export const dynamic = "force-dynamic";

export default async function ResumesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const query = await searchParams;
  const resumes = await listResumes(query.q ?? "", query.archived === "1");
  const uploadFamilies = await listResumes("", false);
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title="Resumes"
        description="A private vault of resume families and the exact PDF versions used in your applications."
        actions={
          <>
            <Button asChild>
              <a href="#upload">Upload Resume</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="#create-family">Create Resume Family</a>
            </Button>
          </>
        }
      />
      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <Field
          label="Search resumes"
          name="q"
          defaultValue={query.q}
          placeholder="Name or category"
        />
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={query.archived === "1"}
          />{" "}
          Include archived
        </label>
        <Button variant="outline">Filter</Button>
        <Link href="/resumes" className="pb-2 text-sm text-muted-foreground">
          Clear
        </Link>
      </form>
      {resumes.length ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {resumes.map((resume) => (
            <Panel key={resume.id}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <Link href={`/resumes/${resume.id}`} className="font-semibold hover:underline">
                    {resume.name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">{resume.category}</p>
                </div>
                <StatusBadge status={resume.isActive ? "ACTIVE" : "ARCHIVED"} />
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {resume.description || "Add a description to help choose this resume family."}
              </p>
              <dl className="mb-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Current version</dt>
                  <dd>{resume.currentVersion?.versionLabel ?? "No PDF uploaded"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Used in applications</dt>
                  <dd>{resume.usageCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd>{displayDate(resume.updatedAt, preferences)}</dd>
                </div>
              </dl>
              <div className="mb-5 flex min-h-6 flex-wrap gap-1.5">
                {resume.currentVersion?.keywords.slice(0, 8).map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-md border border-border bg-secondary px-2 py-1 text-xs"
                  >
                    {keyword}
                  </span>
                ))}
                {(resume.currentVersion?.keywords.length ?? 0) > 8 && (
                  <span className="py-1 text-xs text-muted-foreground">
                    +{resume.currentVersion!.keywords.length - 8}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/resumes/${resume.id}`}>View versions</Link>
                </Button>
                {resume.currentVersion && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/api/resumes/${resume.currentVersion.id}/file?download=1`}>
                      Download PDF
                    </a>
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No matching resume families"
          description="Create a family, then upload its first PDF. Text and editable keyword tags are extracted locally."
          action={
            <Button asChild>
              <a href="#create-family">Create Resume Family</a>
            </Button>
          }
        />
      )}
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <div id="upload">
          <Panel title="Upload Resume">
            {uploadFamilies.length ? (
              <ActionForm action={uploadVersion}>
                <Field label="Resume family" name="resumeId">
                  <select id="resumeId" name="resumeId" required>
                    {uploadFamilies.map((resume) => (
                      <option key={resume.id} value={resume.id}>
                        {resume.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Version label"
                  name="versionLabel"
                  placeholder="v1 — backend roles"
                  required
                  maxLength={80}
                />
                <Field
                  label="PDF file"
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  hint="PDF only, up to 10 MB. Original files remain private and are retained even when text extraction fails."
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="makeCurrent" defaultChecked /> Make this the current
                  version
                </label>
                <Button>Upload PDF</Button>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">
                Create a resume family first using the form beside this panel.
              </p>
            )}
          </Panel>
        </div>
        <div id="create-family">
          <Panel title="Create Resume Family">
            <ActionForm action={createResumeFamily}>
              <Field
                label="Name"
                name="name"
                placeholder="Backend Senior"
                required
                minLength={2}
                maxLength={100}
              />
              <Field
                label="Category"
                name="category"
                placeholder="Backend Engineering"
                defaultValue="General"
                required
                maxLength={80}
              />
              <Field label="Description" name="description">
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  placeholder="When should this resume be used?"
                  maxLength={2000}
                />
              </Field>
              <Button>Create Family</Button>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
