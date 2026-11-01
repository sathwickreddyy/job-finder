import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { checkMailStep } from "@/features/mail/check-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.strictObject({ lastDays: z.number().int().optional() });

/**
 * One page per inbox; call again while `more` is true. `{ "lastDays": n }` (1–180) starts a
 * new window reaching back n days; continue it with calls that leave it out. No body works too.
 */
export async function POST(request: Request) {
  try {
    const options = request.body ? body.parse(await readJson(request)) : {};
    const result = await checkMailStep(options);
    for (const path of ["/mail", "/applications", "/companies", "/"]) revalidatePath(path);
    return apiResponse(result);
  } catch (error) {
    return apiError(error);
  }
}
