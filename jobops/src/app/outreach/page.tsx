import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, applicationEvents, resumes, resumeVersions } from "@/db/schema";
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
  searchParams: Promise<{ job?: string; method?: string; record?: string }>;
}) {
  const p = await searchParams;
  if (p.record && !z.uuid().safeParse(p.record).success) notFound();
  const [existing] = p.record
    ? await db.select().from(applications).where(eq(applications.id, p.record))
    : [];
  const channels = ["REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"];
  if (p.record && (!existing || !channels.includes(existing.source))) notFound();
  const method = existing?.source ?? (channels.includes(p.method ?? "") ? p.method! : "REFERRAL");
  const history = existing
    ? await db
        .select()
        .from(applicationEvents)
        .where(eq(applicationEvents.applicationId, existing.id))
        .orderBy(desc(applicationEvents.occurredAt))
    : [];
  const sent = history.some((event) => event.eventType === "OUTREACH_SENT");
  const [context, data, versions] = await Promise.all([
    getJobContext(existing?.jobId ?? p.job),
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
      {!existing && (
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
      )}
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
          {sent && existing ? (
            <Panel>
              <p>This outreach is already recorded as sent.</p>
              <Link
                href={`/applications/${existing.id}`}
                className="mt-3 inline-block text-sm text-link"
              >
                Open your record
              </Link>
            </Panel>
          ) : (
            <Panel title="Record what happened">
              <RecordForm
                key={method}
                method={method}
                existing={
                  existing
                    ? {
                        id: existing.id,
                        versionId: existing.resumeVersionId,
                        url: existing.applicationUrl,
                        notes: existing.notes,
                        recipient: String(
                          history.find((event) => typeof event.payload.recipient === "string")
                            ?.payload.recipient ?? "",
                        ),
                      }
                    : undefined
                }
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
          )}
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
