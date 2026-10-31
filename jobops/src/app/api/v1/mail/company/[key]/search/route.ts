import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { companySearchStep, readCompanySearch } from "@/features/mail/company-search";
import { companyParam } from "../../company-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.strictObject({
  lastDays: z.number().int().optional(),
  accounts: z.array(z.email()).min(1).max(10).optional(),
  restart: z.boolean().optional(),
});

/** The company's rule, inboxes, last search and the exact query each inbox would receive. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    return apiResponse(await readCompanySearch(companyParam((await params).key)));
  } catch (error) {
    return apiError(error);
  }
}

/**
 * One page per inbox. `{ lastDays?, accounts?, restart? }` starts a new search; send `{}` (or
 * no body) to continue it while `more` is true.
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const key = companyParam((await params).key);
    const options = request.body ? body.parse(await readJson(request)) : {};
    const result = await companySearchStep(key, options);
    for (const path of ["/mail", "/applications", "/companies", "/"]) revalidatePath(path);
    revalidatePath("/companies/[slug]", "page");
    return apiResponse(result);
  } catch (error) {
    return apiError(error);
  }
}
