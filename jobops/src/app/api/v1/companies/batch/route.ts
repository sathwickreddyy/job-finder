import { revalidatePath } from "next/cache";
import { ingestCompanyBatch } from "@/features/companies/ingestion";
import { companyApiError, companyJson, companyResponse } from "@/features/companies/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const result = await ingestCompanyBatch(await companyJson(request));
    revalidatePath("/companies");
    for (const company of result.companies) revalidatePath(`/companies/${company.slug}`);
    return companyResponse(result);
  } catch (error) {
    return companyApiError(error);
  }
}
