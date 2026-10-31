import { revalidatePath } from "next/cache";
import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { storeCompanyRule } from "@/features/mail/rule-store";
import { companyParam } from "../../company-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replace the company's rule: `{ aliases, domains, senders, keywords, excludedTerms }`. */
export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const key = companyParam((await params).key);
    const { rule, placed } = await storeCompanyRule(key, await readJson(request));
    for (const path of ["/mail", "/applications", "/companies", "/"]) revalidatePath(path);
    revalidatePath("/companies/[slug]", "page");
    return apiResponse({ rule, placed });
  } catch (error) {
    return apiError(error);
  }
}
