import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, resumes, resumeVersions } from "@/db/schema";
import { Button, PageHeader, Panel } from "@/components/ui";
import { PromptPanel } from "@/components/prompt-panel";
import { RecordForm } from "@/features/applications/record-form";
import { getJobContext } from "@/features/workspace/job-context";
import { applicationPrompt } from "@/features/workspace/prompts";
import { readWorkspace } from "@/features/workspace/read";
export default async function NewApplication({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  const [allJobs, versions, context, data] = await Promise.all([
    db.select().from(jobs).orderBy(desc(jobs.createdAt)),
    db
      .select({ version: resumeVersions, family: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
      .orderBy(desc(resumeVersions.createdAt)),
    getJobContext(jobId),
    readWorkspace(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Direct application"
        description="Use your assistant or apply on the original site, then record what you sent."
      />
      {context ? (
        <>
          <PromptPanel
            prompt={applicationPrompt(
              context.job.company,
              context.job.title,
              context.snapshot?.description ?? "",
              context.job.canonicalUrl,
              data.context,
            )}
          />
          <p className="text-sm">
            <a
              href={context.job.canonicalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Open the original application page
            </a>{" "}
            ·{" "}
            <Link href={`/outreach?job=${context.job.id}`} className="text-link">
              Prefer a referral or message?
            </Link>
          </p>
        </>
      ) : allJobs.length ? (
        <Panel title="Choose an opening">
          <form className="flex flex-wrap gap-3">
            <select
              name="jobId"
              aria-label="Opening for application"
              className="min-w-0 flex-1"
              required
            >
              <option value="">Choose a saved opening</option>
              {allJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company} — {job.title}
                </option>
              ))}
            </select>
            <Button>Open application prompt</Button>
          </form>
        </Panel>
      ) : (
        <Panel>
          <p className="mb-4 text-muted-foreground">
            Save an opening before recording an application.
          </p>
          <Button asChild>
            <Link href="/find">Find openings</Link>
          </Button>
        </Panel>
      )}
      {context && (
        <Panel title="Record what happened">
          <RecordForm
            jobId={context.job.id}
            jobChoices={allJobs.map((job) => ({
              id: job.id,
              label: `${job.company} — ${job.title}`,
            }))}
            versionChoices={versions.map(({ version, family }) => ({
              id: version.id,
              label: `${family.name} / ${version.versionLabel} / ${version.originalFilename}`,
            }))}
          />
        </Panel>
      )}
    </div>
  );
}
