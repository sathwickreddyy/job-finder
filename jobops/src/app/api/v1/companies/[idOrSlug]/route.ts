import { revalidatePath } from "next/cache";
import { getCompany, patchCompany } from "@/features/companies/ingestion";
import { companyApiError, companyJson, companyResponse } from "@/features/companies/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ idOrSlug: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    return companyResponse(await getCompany((await context.params).idOrSlug));
  } catch (error) {
    return companyApiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const result = await patchCompany((await context.params).idOrSlug, await companyJson(request));
    revalidatePath("/companies");
    revalidatePath(`/companies/${result.company.slug}`);
    return companyResponse({ ...result.company, outcome: result.outcome, changes: result.changes });
  } catch (error) {
    return companyApiError(error);
  }
}
