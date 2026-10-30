import { readMailWorkspace } from "@/features/mail/workspace-read";
import { MailWorkspace } from "@/features/mail/workspace";
import type { WorkspaceQuery } from "@/features/mail/workspace-data";
import { notFound } from "next/navigation";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const metadata = { title: "Mail" };
export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<WorkspaceQuery>;
}) {
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value!.slice(0, 2000)]),
  ) as WorkspaceQuery;
  if (query.application && !z.uuid().safeParse(query.application).success) notFound();
  const data = await readMailWorkspace(query);
  return (
    <MailWorkspace
      key={`${query.company ?? ""}|${query.application ?? ""}`}
      data={data}
      initial={query}
    />
  );
}
