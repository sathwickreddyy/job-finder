import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import { methodNames } from "@/features/applications/domain";
import { getResume, listResumes } from "./service";
import type { GalleryFamily } from "./view-types";

export async function resumeFiles(includeArchived = false): Promise<GalleryFamily[]> {
  const [families, preferences] = await Promise.all([
    listResumes("", includeArchived),
    getDisplayPreferences(),
  ]);
  const details = await Promise.all(families.map((family) => getResume(family.id)));
  return details.flatMap((family) => (family ? [resumePresentation(family, preferences)] : []));
}

export function resumePresentation(
  family: NonNullable<Awaited<ReturnType<typeof getResume>>>,
  preferences: Awaited<ReturnType<typeof getDisplayPreferences>>,
): GalleryFamily {
  return {
    id: family.id,
    name: family.name,
    isArchived: !family.isActive,
    files: family.versions.map((file) => ({
      id: file.id,
      familyId: family.id,
      familyName: family.name,
      label: file.versionLabel,
      filename: file.originalFilename,
      uploaded: displayDate(file.createdAt, preferences),
      size: `${(file.fileSize / 1024).toFixed(1)} KB`,
      isDefault: file.isCurrent && family.isActive,
      isArchived: !family.isActive,
      textExtracted: file.parsingStatus === "COMPLETED",
      changeNotes: file.changeNotes,
      assessmentCount: family.assessments.filter((row) => row.assessment.versionId === file.id)
        .length,
      uses: family.usage
        .filter((record) => record.versionId === file.id)
        .map((record) => ({
          id: record.id,
          company: record.company,
          role: record.title,
          method: methodNames[record.source] ?? "Application",
          outcome: record.appliedAt ? "Applied" : record.outreachSent ? "Sent" : "Preparing",
          date: record.appliedAt ? displayDate(record.appliedAt, preferences) : null,
          submitted: record.source === "DIRECT" && Boolean(record.appliedAt),
        })),
    })),
  };
}
