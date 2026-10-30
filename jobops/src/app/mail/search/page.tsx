import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { loadMailContext } from "@/features/mail/context";
import { readCompanyMail } from "@/features/mail/company-search";
import { MailSearchWorkspace } from "@/features/mail/search-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Search inboxes" };
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
  return (
    <MailSearchWorkspace
      key={company ?? "all"}
      initialSaved={company ? await readCompanyMail(company) : undefined}
      accounts={accounts}
      companies={context.companies.map((c) => ({
        id: c.id,
        name: c.name,
        aliases: c.rule.aliases,
        rule: c.rule,
      }))}
      initialCompany={company}
      initialAccount={query.account}
      contextLabel={
        application
          ? `${context.companies.find((c) => c.id === company)?.name} / ${application.role}`
          : undefined
      }
      backHref={application ? `/applications/${application.id}` : "/mail"}
    />
  );
}
