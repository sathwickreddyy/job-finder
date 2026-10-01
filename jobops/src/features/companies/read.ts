import { and, asc, desc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import {
  applications,
  companyRecords,
  companyFacts,
  companyLocations,
  jobs,
  resumes,
  resumeVersions,
  settings,
} from "@/db/schema";
import type { Company } from "./catalog";

export async function readCompanies() {
  const [records, openings, families, references, storedCompanies, locations, facts] =
    await Promise.all([
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
      db
        .select()
        .from(companyRecords)
        .where(eq(companyRecords.status, "ACTIVE"))
        .orderBy(asc(companyRecords.name)),
      db.select().from(companyLocations).orderBy(asc(companyLocations.city)),
      db
        .select()
        .from(companyFacts)
        .orderBy(asc(companyFacts.category), desc(companyFacts.lastObservedAt)),
    ]);
  const companies: Company[] = storedCompanies.map((row) => {
    const present = locations.filter((location) => location.companyId === row.id);
    return {
      id: row.slug,
      name: row.name,
      aliases: row.aliases,
      cities: [...new Set(present.map((location) => location.city))],
      focus: row.focus,
      careersUrl: row.careersUrl ?? "",
      portalNote: row.portalNote,
      locationSource: present.find((location) => location.sourceUrl)?.sourceUrl ?? "",
      locations: present,
      facts: facts.filter((fact) => fact.companyId === row.id),
    };
  });
  return { records, openings, families, references, companies };
}
export type CompaniesData = Awaited<ReturnType<typeof readCompanies>>;
