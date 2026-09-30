import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel } from "@/components/ui";
import { quickResumeUpload } from "@/features/candidate/hub-actions";
import { listResumes } from "@/features/resumes/service";
export default async function Resumes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const p = await searchParams;
  const files = await listResumes(p.q, p.archived === "1");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your resumes"
        description="Your actual files, revised versions, bullet changes and company/role history."
        actions={
          <Button asChild>
            <a href="#upload">
              <Upload size={17} aria-hidden />
              Upload a resume
            </a>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-selected p-5 text-selected-foreground">
        <p>Want to tailor a version for a specific role?</p>
        <Button variant="outline" asChild>
          <Link href="/resume-prompt">Open resume prompt</Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((file) => (
          <Link
            key={file.id}
            href={`/resumes/${file.id}`}
            className="pressable rounded-card border border-border bg-card p-6 text-foreground hover:border-primary hover:no-underline"
          >
            <FileText size={27} strokeWidth={1.6} className="mb-4 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">{file.name}</h2>
            <p className="mt-2 break-all text-sm text-muted-foreground">
              {file.currentVersion?.originalFilename || "No file uploaded"}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              {file.currentVersion?.versionLabel || "Original pending"} · {file.usageCount} recorded
              actions{file.isActive ? "" : " · archived"}
            </p>
          </Link>
        ))}
      </div>
      {!files.length && (
        <Panel>
          <h2 className="text-xl font-semibold">No uploaded resumes yet</h2>
          <p className="mt-2 text-muted-foreground">
            Upload your existing PDF below. Each revised file stays separate from the original.
          </p>
        </Panel>
      )}
      <section id="upload">
        <Panel title="Upload your existing resume">
          <ActionForm action={quickResumeUpload}>
            <Field label="Resume name" name="name" placeholder="My resume" />
            <Field label="PDF file" name="file">
              <input id="file" name="file" type="file" accept="application/pdf,.pdf" required />
            </Field>
            <p className="text-sm text-muted-foreground">
              PDF up to 10 MiB. Your file is kept as uploaded.
            </p>
            <Button>Upload resume</Button>
          </ActionForm>
        </Panel>
      </section>
      <details className="rounded-card border border-border bg-card p-5">
        <summary className="cursor-pointer text-sm font-medium">
          Find an older or archived resume
        </summary>
        <form className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            name="q"
            aria-label="Search resumes"
            defaultValue={p.q}
            placeholder="Name or category"
            className="!w-auto min-w-0 flex-1"
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="archived" value="1" defaultChecked={p.archived === "1"} />
            Include archived
          </label>
          <Button variant="outline">Search</Button>
        </form>
      </details>
    </div>
  );
}
