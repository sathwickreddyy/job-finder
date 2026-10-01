import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { HomeGallery } from "@/features/workspace/home-gallery";
import { readWorkspace } from "@/features/workspace/read";

export const metadata = { title: "Home options" };

export default async function HomeGalleryPage() {
  const [data, [person]] = await Promise.all([
    readWorkspace(),
    db.select().from(candidateProfiles).limit(1),
  ]);
  const resume = data.resumes.find((row) => row.isCurrent) ?? data.resumes[0];
  return (
    <HomeGallery
      identity={{
        fullName: person?.preferredName || person?.fullName || "",
        role: person?.currentRole ?? "",
        company: person?.currentCompany ?? "",
        years: person?.yearsOfExperience ?? null,
        city: person?.currentCity ?? "",
        summary: person?.careerSummary?.split(/(?<=\.)\s/)[0] ?? "",
        searchRole: person?.desiredRoles[0] || person?.currentRole || "Software Engineer",
        searchCity: person?.preferredLocations[0] || person?.currentCity || "Bengaluru",
      }}
      sites={data.sites}
      resume={
        resume
          ? {
              id: resume.id,
              familyId: resume.familyId,
              name: resume.name,
              label: resume.label,
              filename: resume.filename,
            }
          : null
      }
    />
  );
}
