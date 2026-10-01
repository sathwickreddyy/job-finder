import { and, desc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobs, resumes, resumeVersions, settings } from "@/db/schema";

export async function readCompanies() {
  const [records, openings, families, references] = await Promise.all([
    db
      .select({
        id: applications.id,
        jobId: jobs.id,
        company: jobs.company,
        title: jobs.title,
        location: jobs.location,
        status: applications.status,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt,
        version: {
          id: resumeVersions.id,
          familyId: resumeVersions.resumeId,
          label: resumeVersions.versionLabel,
          filename: resumeVersions.originalFilename,
        },
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(resumeVersions, eq(resumeVersions.id, applications.resumeVersionId))
      .orderBy(desc(applications.updatedAt)),
    db
      .select({ id: jobs.id, company: jobs.company, location: jobs.location, title: jobs.title })
      .from(jobs)
      .orderBy(desc(jobs.createdAt)),
    db
      .select({
        id: resumes.id,
        name: resumes.name,
        isActive: resumes.isActive,
        version: {
          id: resumeVersions.id,
          label: resumeVersions.versionLabel,
          filename: resumeVersions.originalFilename,
        },
      })
      .from(resumes)
      .leftJoin(
        resumeVersions,
        and(eq(resumes.id, resumeVersions.resumeId), eq(resumeVersions.isCurrent, true)),
      )
      .orderBy(resumes.name),
    db.select().from(settings).where(like(settings.key, "companyResume:%")),
  ]);
  return { records, openings, families, references };
}
export type CompaniesData = Awaited<ReturnType<typeof readCompanies>>;
