import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { applicationHref, companyPageHref } from "@/features/applications/navigation";
import { readApplications } from "@/features/applications/read";
import { PREVIOUS_JOB } from "@/features/companies/previous-job";

export const dynamic = "force-dynamic";

const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? value : null);

/** An application has no page of its own: its link lands on its row on the company page. */
export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ outcome?: string; mail?: string; round?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const { records } = await readApplications();
  const record = records.find((row) => row.id === id);
  if (!record) notFound();
  // A previous job is history, not an application: its company page has no row to open.
  if (record.source === PREVIOUS_JOB) redirect(companyPageHref(record));
  redirect(
    applicationHref(record, {
      mail: uuid(query.mail),
      outcome: query.outcome?.slice(0, 40),
      round: uuid(query.round),
    }),
  );
}

export const metadata = { title: "Application" };
