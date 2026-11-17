import { readApplications } from "@/features/applications/read";
import { PREVIOUS_JOB } from "@/features/companies/previous-job";

export type SlugResolution<C> =
  | { kind: "company"; company: C }
  | { kind: "minimal"; key: string; name: string }
  | { kind: "missing" };

/**
 * A company page slug is a company record's id; failing that it is the URL-encoded company key
 * of applications at a company with no record. Anything else, or a malformed escape, is missing.
 */
export async function resolveCompanySlug<C extends { id: string }>(
  slug: string,
  companies: C[],
): Promise<SlugResolution<C>> {
  const company = companies.find((row) => row.id === slug);
  if (company) return { kind: "company", company };
  let key: string;
  try {
    key = decodeURIComponent(slug);
  } catch {
    return { kind: "missing" };
  }
  const { records } = await readApplications();
  const own = records.find((record) => record.companyKey === key && record.source !== PREVIOUS_JOB);
  return own ? { kind: "minimal", key, name: own.companyName } : { kind: "missing" };
}
