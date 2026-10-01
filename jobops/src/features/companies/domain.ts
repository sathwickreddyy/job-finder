import { z } from "zod";
import { companies, type Company } from "./catalog";

export const companyCities = ["Bengaluru", "Hyderabad"] as const;
export type CompanyCity = (typeof companyCities)[number];
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function companyActivity<
  T extends { company: string; location: string; appliedAt: Date | null },
  J extends { company: string; location: string },
>(company: Company, city: CompanyCity, applications: T[], jobs: J[]) {
  const names = [company.name, ...company.aliases].map(normalize);
  const matchesCompany = (row: { company: string }) => names.includes(normalize(row.company));
  const location = city === "Bengaluru" ? /\b(?:bengaluru|bangalore)\b/i : /\bhyderabad\b/i;
  const records = applications.filter(matchesCompany);
  const localRecords = records.filter((row) => location.test(row.location));
  return {
    records,
    localRecords,
    sent: localRecords.filter((row) => row.appliedAt !== null).length,
    openings: jobs.filter((row) => matchesCompany(row) && location.test(row.location)),
  };
}

export function companyResumeKey(companyId: string, city: CompanyCity) {
  return `companyResume:${companyId}:${city}`;
}

export const companyResumeSchema = z
  .object({
    companyId: z.string(),
    city: z.enum(companyCities),
    resumeId: z.union([z.literal(""), z.uuid()]),
  })
  .refine(
    (value) =>
      companies.some(
        (company) => company.id === value.companyId && company.cities.includes(value.city),
      ),
    {
      message: "Choose a company listed in this city.",
    },
  );
