import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { resumes, resumeVersions } from "@/db/schema";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { laneHref } from "@/features/applications/navigation";
import { readApplications } from "@/features/applications/read";
import { ApplicationDetail } from "@/features/applications/views/detail";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ outcome?: string; mail?: string; notice?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  // Outcome and mail links open the row in place on Applications, with the form ready.
  if (query.outcome !== undefined || query.mail !== undefined)
    redirect(laneHref(id, { mail: query.mail, outcome: query.outcome }));
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
    <div className="flex flex-col gap-4">
      <Link
        href={laneHref(record.id)}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-link"
      >
        <ArrowLeft aria-hidden size={14} />
        Back to Applications
      </Link>
      <ApplicationDetail
        record={record}
        linked={records.filter((row) => record.linkedIds.includes(row.id))}
        versions={versions.map(({ version, family }) => ({
          id: version.id,
          label: `${family.name} / ${version.versionLabel} / ${version.originalFilename}`,
        }))}
        preferences={preferences}
        now={new Date()}
        notice={query.notice?.slice(0, 300)}
      />
    </div>
  );
}
