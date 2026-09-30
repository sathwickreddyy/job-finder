import Link from "next/link";
import { Button, PageHeader, Panel } from "@/components/ui";
import { PromptPanel } from "@/components/prompt-panel";
import { getJobContext } from "@/features/workspace/job-context";
import { readWorkspace } from "@/features/workspace/read";
import { resumePrompt } from "@/features/workspace/prompts";

export default async function ResumePrompt({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; resume?: string }>;
}) {
  const p = await searchParams;
  const [context, data] = await Promise.all([getJobContext(p.job), readWorkspace()]);
  const file = data.resumes.find((version) => version.id === p.resume);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Review my resume"
        description="Attach your actual file in ChatGPT or Claude and work through changes there."
      />
      <PromptPanel
        prompt={resumePrompt(
          context?.job.company ?? "",
          context?.job.title ?? "",
          context?.snapshot?.description ?? "",
          data.context,
          file?.filename,
        )}
      />
      <details className="rounded-card border border-border bg-card p-5" open={!context}>
        <summary className="cursor-pointer font-medium">
          Choose the opening and resume for this prompt
        </summary>
        <form className="mt-5 space-y-4">
          <label className="block space-y-2">
            Opening
            <select name="job" defaultValue={context?.job.id ?? ""}>
              <option value="">I will paste the description in my assistant</option>
              {data.openings.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company} — {job.role}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            Resume file
            <select name="resume" defaultValue={file?.id ?? ""}>
              <option value="">I will attach a file in my assistant</option>
              {data.resumes.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name} / {version.label} / {version.filename}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline">Update prompt</Button>
        </form>
      </details>
      {file && (
        <Panel title="File to attach">
          <p className="mb-4 break-all text-sm">{file.filename}</p>
          <Button variant="outline" asChild>
            <a href={`/api/resumes/${file.id}/file?download=1`}>Download this resume</a>
          </Button>
        </Panel>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card p-6">
        <div>
          <h2 className="font-semibold">Finished reviewing in your assistant?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring back the revised PDF, bullet changes and assessment.
          </p>
        </div>
        <Button asChild>
          <Link href={file ? `/resumes/${file.familyId}#upload-version` : "/resumes#upload"}>
            Upload a resume version
          </Link>
        </Button>
      </div>
    </div>
  );
}
