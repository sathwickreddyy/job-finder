import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { resumes, resumeVersions } from "@/db/schema";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { readApplications } from "@/features/applications/read";
import { ApplicationDetail } from "@/features/applications/views/detail";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const [{ records }, versions, preferences] = await Promise.all([
    readApplications(),
    db
      .select({ version: resumeVersions, family: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id)),
    getDisplayPreferences(),
  ]);
  const record = records.find((row) => row.id === id);
  if (!record) notFound();
  return (
    <ApplicationDetail
      record={record}
      linked={records.filter((row) => record.linkedIds.includes(row.id))}
      versions={versions.map(({ version, family }) => ({
        id: version.id,
        label: `${family.name} / ${version.versionLabel} / ${version.originalFilename}`,
      }))}
      preferences={preferences}
      now={new Date()}
      requested={query.outcome}
    />
  );
}
