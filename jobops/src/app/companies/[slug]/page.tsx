import { notFound } from "next/navigation";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { CompanyDetail, detailTabs, type DetailTab } from "@/features/companies/detail";
import { interviewReports } from "@/features/companies/metrics";
import { readCompanies } from "@/features/companies/read";
import { companySummaries, sharedPayScale } from "@/features/companies/summary";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ city?: string; tab?: string }>;
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
  const tab = detailTabs.includes(query.tab as DetailTab) ? (query.tab as DetailTab) : "pay";
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
    />
  );
}
