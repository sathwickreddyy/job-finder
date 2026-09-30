import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  applications,
  candidateProfiles,
  jobResumeMatches,
  jobs,
  profiles,
  resumes,
  resumeVersions,
  settings,
} from "@/db/schema";

import { jobPreferencesContext } from "./prompts";

// Real personal records shared by the home page and the read-only gallery.
export async function readWorkspace() {
  const [candidate, preferences, sites, openings, applied, versions, matches] = await Promise.all([
    db.select().from(candidateProfiles).limit(1),
    db
      .select()
      .from(settings)
      .where(inArray(settings.key, ["workingPreferences", "jobPreferences"])),
    db
      .select({ name: profiles.displayName, url: profiles.profileUrl })
      .from(profiles)
      .orderBy(profiles.displayName),
    db
      .select({
        id: jobs.id,
        company: jobs.company,
        role: jobs.title,
        source: jobs.source,
        url: jobs.canonicalUrl,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .orderBy(desc(jobs.createdAt)),
    db
      .select({
        id: applications.id,
        versionId: applications.resumeVersionId,
        company: jobs.company,
        role: jobs.title,
        status: applications.status,
        appliedAt: applications.appliedAt,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id)),
    db
      .select({
        id: resumeVersions.id,
        familyId: resumes.id,
        name: resumes.name,
        label: resumeVersions.versionLabel,
        filename: resumeVersions.originalFilename,
        createdAt: resumeVersions.createdAt,
        isCurrent: resumeVersions.isCurrent,
      })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
      .where(eq(resumes.isActive, true))
      .orderBy(desc(resumeVersions.createdAt)),
    db
      .select({
        versionId: jobResumeMatches.resumeVersionId,
        score: jobResumeMatches.score,
        company: jobs.company,
        role: jobs.title,
        matched: jobResumeMatches.matchedKeywords,
        missing: jobResumeMatches.missingKeywords,
      })
      .from(jobResumeMatches)
      .innerJoin(jobs, eq(jobs.id, jobResumeMatches.jobId)),
  ]);
  const person = candidate[0];
  const publicSites = [...sites];
  for (const [name, url] of [
    ["LinkedIn", person?.linkedinUrl],
    ["GitHub", person?.githubUrl],
    ["Portfolio", person?.portfolioUrl],
  ]) {
    if (url && !publicSites.some((site) => site.url === url))
      publicSites.push({ name: name!, url });
  }
  return {
    name: person?.preferredName || person?.fullName?.split(" ")[0] || "",
    role: person?.desiredRoles.join(", ") || person?.currentRole || "",
    location: person?.preferredLocations.join(", ") || person?.currentCity || "India",
    context: [
      person?.careerSummary,
      person?.noticePeriod && `Notice period: ${person.noticePeriod}`,
      preferences.find((item) => item.key === "workingPreferences")?.value.context,
      jobPreferencesContext({
        remotePreference: person?.remotePreference,
        ...(preferences.find((item) => item.key === "jobPreferences")?.value ?? {}),
      }),
    ]
      .filter(Boolean)
      .join("\n"),
    sites: publicSites.filter((site) => site.url && /^https?:\/\//i.test(site.url)),
    openings: openings.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    applications: applied.map((row) => ({
      ...row,
      appliedAt: row.appliedAt?.toISOString() ?? null,
    })),
    resumes: versions.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      usage: applied
        .filter((item) => item.versionId === row.id)
        .map((item) => ({ company: item.company, role: item.role, status: item.status })),
      matches: matches.filter((item) => item.versionId === row.id),
    })),
    today: new Date().toISOString(),
  };
}
export type WorkspaceData = Awaited<ReturnType<typeof readWorkspace>>;
