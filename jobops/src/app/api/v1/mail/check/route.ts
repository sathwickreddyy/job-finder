import { revalidatePath } from "next/cache";
import { apiError, apiResponse } from "@/features/agent-api/http";
import { checkMailStep } from "@/features/mail/check-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One page per inbox; call again while `more` is true. The body is ignored. */
export async function POST() {
  try {
    const result = await checkMailStep();
    for (const path of ["/mail", "/applications", "/companies", "/"]) revalidatePath(path);
    return apiResponse(result);
  } catch (error) {
    return apiError(error);
  }
}
