import { z } from "zod";
import type { Company } from "./catalog";
import type { CompaniesData } from "./read";

export const companyCities = ["Bengaluru", "Hyderabad"] as const;
export type CompanyCity = string;
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function companyActivity<
  T extends { company: string; location: string; appliedAt: Date | null },
  J extends { company: string; location: string },
>(company: Company, city: CompanyCity, applications: T[], jobs: J[]) {
  const names = [company.name, ...company.aliases].map(normalize);
  const matchesCompany = (row: { company: string }) => names.includes(normalize(row.company));
  const cityPattern =
    city === "Bengaluru" ? "(?:bengaluru|bangalore)" : city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const location = new RegExp(`(?:^|[^\\p{L}\\p{N}])${cityPattern}(?:$|[^\\p{L}\\p{N}])`, "iu");
  const records = applications.filter(matchesCompany);
  const matchesLocation = (row: { location: string }) =>
    city === "Location not recorded" ? !row.location.trim() : location.test(row.location);
  const localRecords = records.filter(matchesLocation);
  return {
    records,
    localRecords,
    sent: localRecords.filter((row) => row.appliedAt !== null).length,
    allOpenings: jobs.filter(matchesCompany),
    openings: jobs.filter((row) => matchesCompany(row) && matchesLocation(row)),
  };
}

export function companyResumeKey(companyId: string, city: CompanyCity) {
  return `companyResume:${companyId}:${city}`;
}

export function companyResumeReference(company: Company, city: CompanyCity, data: CompaniesData) {
  const activity = companyActivity(company, city, data.records, data.openings);
  const latest = activity.localRecords.find((row) => row.version);
  const reference = data.references.find((row) => row.key === companyResumeKey(company.id, city));
  const familyId =
    typeof reference?.value.resumeId === "string"
      ? reference.value.resumeId
      : latest?.version?.familyId;
  return { activity, reference, family: data.families.find((row) => row.id === familyId) };
}

export const companyResumeSchema = z.object({
  companyId: z.string().trim().min(1).max(150),
  city: z.string().trim().min(1).max(200),
  resumeId: z.union([z.literal(""), z.uuid()]),
});
