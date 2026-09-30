import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { resumes, resumeVersions } from "@/db/schema";
import { Button, PageHeader, Panel } from "@/components/ui";
import { PromptPanel } from "@/components/prompt-panel";
import { RecordForm } from "@/features/applications/record-form";
import { getJobContext } from "@/features/workspace/job-context";
import { outreachPrompt } from "@/features/workspace/prompts";
import { readWorkspace } from "@/features/workspace/read";
import { methodNames } from "@/features/applications/domain";
export default async function Outreach({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; method?: string }>;
}) {
  const p = await searchParams;
  const method = ["REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"].includes(p.method ?? "")
    ? p.method!
    : "REFERRAL";
  const [context, data, versions] = await Promise.all([
    getJobContext(p.job),
    readWorkspace(),
    db
      .select({ version: resumeVersions, family: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
      .orderBy(desc(resumeVersions.createdAt)),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Referral or message"
        description="Use a clear prompt, choose your contact, then record the outreach you sent."
      />
      <nav className="flex flex-wrap gap-2" aria-label="Outreach method">
        {["REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"].map((kind) => (
          <Button key={kind} variant={method === kind ? "secondary" : "outline"} asChild>
            <Link
              href={`/outreach?${new URLSearchParams({ ...(p.job ? { job: p.job } : {}), method: kind })}`}
              aria-current={method === kind ? "page" : undefined}
            >
              {methodNames[kind]}
            </Link>
          </Button>
        ))}
      </nav>
      {context ? (
        <>
          <PromptPanel
            key={method}
            prompt={outreachPrompt(
              context.job.company,
              context.job.title,
              context.snapshot?.description ?? "",
              context.job.canonicalUrl,
              method,
              data.context,
            )}
          />
          <Panel title="Record what happened">
            <RecordForm
              key={method}
              method={method}
              jobId={context.job.id}
              jobChoices={[
                { id: context.job.id, label: `${context.job.company} — ${context.job.title}` },
              ]}
              versionChoices={versions.map(({ version, family }) => ({
                id: version.id,
                label: `${family.name} / ${version.versionLabel} / ${version.originalFilename}`,
              }))}
            />
          </Panel>
        </>
      ) : (
        <Panel title="Choose an opening">
          <form className="space-y-4">
            <input type="hidden" name="method" value={method} />
            <select name="job" aria-label="Opening for outreach" required>
              <option value="">Choose a saved opening</option>
              {data.openings.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.company} — {job.role}
                </option>
              ))}
            </select>
            <Button>Open outreach prompt</Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
