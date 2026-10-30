import { notFound } from "next/navigation";
import { normalizeCompany } from "@/features/applications/lanes";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { CompanyDetail, detailTabs, type DetailTab } from "@/features/companies/detail";
import { interviewReports } from "@/features/companies/metrics";
import { readCompanies } from "@/features/companies/read";
import { companySummaries, sharedPayScale } from "@/features/companies/summary";
import { readCompanyPanel } from "@/features/timeline/company-panel";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ city?: string; tab?: string; role?: string; cursor?: string }>;
}) {
  const [{ slug }, query, data, preferences] = await Promise.all([
    params,
    searchParams,
    readCompanies(),
    getDisplayPreferences(),
  ]);
  const company = data.companies.find((row) => row.id === slug);
  if (!company) notFound();
  const summaries = companySummaries(data);
  // "progress" is the old name of the Timeline tab.
  const tab = detailTabs.includes(query.tab as DetailTab) ? (query.tab as DetailTab) : "timeline";
  const timeline = await readCompanyPanel(normalizeCompany(company.name), query, (change) => {
    const params = new URLSearchParams({
      ...(query.city ? { city: query.city } : {}),
      tab: "timeline",
      ...(change.role ? { role: change.role } : {}),
      ...(change.cursor ? { cursor: change.cursor } : {}),
    });
    return `/companies/${slug}?${params}`;
  });
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
      timeline={timeline}
    />
  );
}
