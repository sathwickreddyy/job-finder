import { revalidatePath } from "next/cache";
import { listCompanies, upsertCompany } from "@/features/companies/ingestion";
import { companyApiError, companyJson, companyResponse } from "@/features/companies/http";
import { companyFilterSchema } from "@/features/companies/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const filters = companyFilterSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const companies = await listCompanies(filters);
    const selected = filters.include?.split(",");
    return companyResponse({
      companies: companies.map((company) => {
        const result: Record<string, unknown> = { ...company };
        if (selected && !selected.includes("facts")) delete result.facts;
        if (selected && !selected.includes("locations")) delete result.locations;
        return result;
      }),
    });
  } catch (error) {
    return companyApiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const result = await upsertCompany(await companyJson(request));
    revalidatePath("/companies");
    return companyResponse(
      { ...result.company, outcome: result.outcome, changes: result.changes },
      result.outcome === "created" ? 201 : 200,
    );
  } catch (error) {
    return companyApiError(error);
  }
}
