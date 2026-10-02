import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getResume } from "@/features/resumes/service";

/** Earlier per-family detail URLs now open the matching file in the resume workspace. */
export default async function ResumeDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; tab?: string; upload?: string }>;
}) {
  const [{ id }, p] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const resume = await getResume(id);
  if (!resume) notFound();
  const version =
    resume.versions.find((file) => file.id === p.version) ??
    resume.versions.find((file) => file.isCurrent) ??
    resume.versions[0];
  const query = new URLSearchParams(version ? { file: version.id } : { resume: id });
  if (!resume.isActive) query.set("archived", "1");
  if (p.upload === "1") query.set("upload", "1");
  const section = { changes: "changes", ats: "assessments" }[p.tab ?? ""];
  if (section) query.set("section", section);
  redirect(`/resumes?${query}`);
}
