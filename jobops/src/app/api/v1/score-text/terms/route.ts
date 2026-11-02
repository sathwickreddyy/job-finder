import { z } from "zod";
import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { RESUMENEXT_MAX_JD } from "@/features/resumes/score/resumenext-client";
import { suggestMustHaves } from "@/features/resumes/score/text";
import { ToolError } from "@/features/resumes/score/tool-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.strictObject({
  description: z.string().trim().min(1).max(RESUMENEXT_MAX_JD),
});

/** Suggested terms for a pasted description, every one a must-have. Nothing is saved. */
export async function POST(request: Request) {
  try {
    const { description } = bodySchema.parse(await readJson(request));
    return apiResponse({ terms: await suggestMustHaves(description) });
  } catch (error) {
    if (error instanceof ToolError)
      return apiResponse({ error: error.message, code: error.code }, 502);
    return apiError(error);
  }
}
