import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Field, PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { changeJob, updateJobDescription } from "@/features/jobs/actions";
import { getJobContext } from "@/features/workspace/job-context";
import { jobStatuses } from "@/db/schema";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getJobContext(id);
  if (!context) notFound();
  const { job, snapshot, snapshots } = context;
  const preferences = await getDisplayPreferences();
  return (
    <div className="space-y-6">
      <Link href="/jobs" className="text-sm text-link">
        All saved openings
      </Link>
      <PageHeader
        title={job.title}
        description={`${job.company} · ${job.location || "Location not recorded"}`}
        actions={
          <Button asChild>
            <Link href={`/resume-prompt?job=${id}`}>Review my resume</Link>
          </Button>
        }
      />
      <Panel title="Job description">
        <p className="mb-5 text-sm text-muted-foreground">
          {job.source.replaceAll("_", " ")} ·{" "}
          <a href={job.canonicalUrl} target="_blank" rel="noreferrer" className="text-link">
            Open original listing
          </a>
        </p>
        <p className="max-w-[80ch] whitespace-pre-wrap leading-7">
          {snapshot?.description ||
            "No full description is saved. Add it below before reviewing your resume."}
        </p>
      </Panel>
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-card p-6">
        <div className="mr-auto">
          <h2 className="font-semibold">Ready to act on this role?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the route you want to take after your resume is ready.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/applications/new?jobId=${id}`}>Direct application</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/outreach?job=${id}`}>Referral or message</Link>
        </Button>
      </div>
      <details className="rounded-card border border-border bg-card p-6">
        <summary className="cursor-pointer font-medium">
          Notes and saved description history
        </summary>
        <div className="mt-5 space-y-6">
          <ActionForm action={changeJob}>
            <input type="hidden" name="id" value={id} />
            <Field label="Job status" name="status">
              <select id="status" name="status" defaultValue={job.status}>
                {jobStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="My notes" name="notes">
              <textarea id="notes" name="notes" defaultValue={job.notes} />
            </Field>
            <Button variant="outline">Save job status</Button>
          </ActionForm>
          <ActionForm action={updateJobDescription}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="keywords" value={snapshot?.skills.join(",") ?? ""} />
            <input
              type="hidden"
              name="requirements"
              value={snapshot?.requirements.join("\n") ?? ""}
            />
            <Field label="Updated job description" name="description">
              <textarea
                id="description"
                name="description"
                rows={8}
                defaultValue={snapshot?.description}
              />
            </Field>
            <Button variant="outline">Save description version</Button>
          </ActionForm>
          <h2 className="text-lg font-semibold">Snapshot history ({snapshots.length})</h2>
          {snapshots.map((item) => (
            <details key={item.id}>
              <summary className="cursor-pointer text-sm">
                {displayDate(item.capturedAt, preferences, true)}
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {item.description}
              </p>
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}
