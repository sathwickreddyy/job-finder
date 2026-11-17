import { notFound } from "next/navigation";
import { z } from "zod";
import { normalizeCompany } from "@/features/applications/lanes";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { readCompanyApplications } from "@/features/companies/applications";
import { CompanyDetail, detailTabs, tabAliases, type DetailTab } from "@/features/companies/detail";
import { interviewReports } from "@/features/companies/metrics";
import { resolveCompanySlug } from "@/features/companies/resolve-slug";
import { MinimalCompanyPage } from "@/features/companies/views/minimal-company";
import { readCompanies } from "@/features/companies/read";
import { companySummaries, sharedPayScale } from "@/features/companies/summary";

const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? value : undefined);

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    city?: string;
    tab?: string;
    open?: string;
    cursor?: string;
    unplacedCursor?: string;
    outcome?: string;
    mail?: string;
    notice?: string;
  }>;
}) {
  const [{ slug }, query, data, preferences] = await Promise.all([
    params,
    searchParams,
    readCompanies(),
    getDisplayPreferences(),
  ]);
  const resolved = await resolveCompanySlug(slug, data.companies);
  if (resolved.kind === "missing") notFound();
  const now = new Date();
  const openId = uuid(query.open);
  if (resolved.kind === "minimal")
    return (
      <MinimalCompanyPage
        name={resolved.name}
        companyKey={resolved.key}
        data={await readCompanyApplications(resolved.key, query, now)}
        openId={openId}
        requested={openId ? query.outcome : undefined}
        mailIntent={uuid(query.mail)}
        notice={query.notice?.slice(0, 200)}
        now={now}
      />
    );
  const { company } = resolved;
  const summaries = companySummaries(data);
  const named = query.tab ? (tabAliases[query.tab] ?? query.tab) : undefined;
  const tab = detailTabs.includes(named as DetailTab) ? (named as DetailTab) : "applications";
  const applications = await readCompanyApplications(normalizeCompany(company.name), query, now);
  return (
    <CompanyDetail
      company={company}
      summary={summaries.find((row) => row.id === slug)!}
      reports={interviewReports(company.facts ?? [])}
      data={data}
      preferences={preferences}
      scaleMax={sharedPayScale(summaries)}
      city={query.city}
      tab={tab}
      applications={applications}
      openId={openId}
      requested={openId ? query.outcome : undefined}
      mailIntent={uuid(query.mail)}
      notice={query.notice?.slice(0, 200)}
      now={now}
    />
  );
}
