import { z } from "zod";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { loadMailContext } from "@/features/mail/context";
import { MailSearchWorkspace } from "@/features/mail/search-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Advanced inbox search" };
export default async function MailSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; application?: string; account?: string }>;
}) {
  const query = await searchParams;
  if (query.application && !z.uuid().safeParse(query.application).success) notFound();
  const [context, accounts] = await Promise.all([
    loadMailContext(),
    db
      .select({
        id: mailConnections.id,
        email: mailConnections.email,
        provider: mailConnections.provider,
      })
      .from(mailConnections),
  ]);
  const application = query.application
    ? context.applications.find((a) => a.id === query.application)
    : undefined;
  if (query.application && !application) notFound();
  const company = application?.company ?? query.company;
  if (company && !context.companies.some((c) => c.id === company)) notFound();
  // Older company and application links open the saved-rule search in the mail workspace.
  if (company)
    redirect(
      `/mail?${new URLSearchParams({
        ...(application ? { application: application.id } : { company }),
        ...(query.account ? { account: query.account } : {}),
        view: "history",
        search: "1",
      })}`,
    );
  return (
    <MailSearchWorkspace
      key={query.account ?? ""}
      accounts={accounts}
      companies={context.companies.map((c) => ({
        id: c.id,
        name: c.name,
        aliases: c.rule.aliases,
      }))}
      initialAccount={query.account}
    />
  );
}
