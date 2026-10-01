import { z } from "zod";
import type { Company } from "./catalog";

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
    openings: jobs.filter((row) => matchesCompany(row) && matchesLocation(row)),
  };
}

export function companyResumeKey(companyId: string, city: CompanyCity) {
  return `companyResume:${companyId}:${city}`;
}

export const companyResumeSchema = z.object({
  companyId: z.string().trim().min(1).max(150),
  city: z.string().trim().min(1).max(200),
  resumeId: z.union([z.literal(""), z.uuid()]),
});
