import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, resumes, resumeVersions } from "@/db/schema";
import { PageHeader, Panel } from "@/components/ui";
import { ApplicationForm } from "@/features/applications/form";
export default async function NewApplication({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { jobId } = await searchParams;
  const [allJobs, versions] = await Promise.all([
    db.select().from(jobs).orderBy(desc(jobs.createdAt)),
    db
      .select({ version: resumeVersions, family: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
      .orderBy(desc(resumeVersions.createdAt)),
  ]);
  return (
    <>
      <PageHeader
        title="New application"
        description="An application records your progress. External submission remains under your control."
      />
      <Panel className="max-w-4xl">
        <ApplicationForm
          selectedJob={jobId}
          jobChoices={allJobs.map((j) => ({ id: j.id, label: `${j.company} — ${j.title}` }))}
          versionChoices={versions.map((v) => ({
            id: v.version.id,
            label: `${v.family.name} / ${v.version.versionLabel}`,
          }))}
        />
      </Panel>
    </>
  );
}
