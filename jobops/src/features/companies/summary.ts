import { companyActivity } from "./domain";
import { companyMetrics, companyStage, type CompanyMetrics, type PipelineStage } from "./metrics";
import type { CompaniesData } from "./read";

export type CompanySummary = {
  id: string;
  name: string;
  focus: string;
  cities: string[];
  careersUrl: string;
  metrics: CompanyMetrics;
  stage: PipelineStage;
  applications: number;
  openings: number;
};

export function companySummaries(data: CompaniesData): CompanySummary[] {
  return data.companies.map((company) => {
    // Stage spans every city: an application anywhere counts as progress with the company.
    const activity = companyActivity(company, "", data.records, data.openings);
    return {
      id: company.id,
      name: company.name,
      focus: company.focus,
      cities: company.cities,
      careersUrl: company.careersUrl,
      metrics: companyMetrics(company.facts ?? []),
      stage: companyStage(
        activity.records.map((row) => row.status),
        activity.allOpenings.length,
      ),
      applications: activity.records.filter((row) => row.appliedAt).length,
      openings: activity.allOpenings.length,
    };
  });
}

/** One fixed-pay scale shared by every chart, rounded up to the next ₹10 LPA. */
export function sharedPayScale(companies: CompanySummary[]) {
  const top = Math.max(1, ...companies.map((row) => row.metrics.fixed?.max ?? 0));
  return Math.ceil(top / 1_000_000) * 1_000_000;
}
