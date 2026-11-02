import { z } from "zod";
import { ApiError, apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { TOOL_SOURCES } from "@/features/resumes/fit/tools";
import { RESUMENEXT_MAX_JD } from "@/features/resumes/score/resumenext-client";
import { reviewedTermSchema } from "@/features/resumes/score/terms";
import { scoreText } from "@/features/resumes/score/text";
import { ToolError } from "@/features/resumes/score/tool-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string }> };
const bodySchema = z.strictObject({
  description: z.string().trim().min(1).max(RESUMENEXT_MAX_JD),
  tool: z.enum(TOOL_SOURCES),
  terms: z.array(reviewedTermSchema).max(100).optional(),
});

/** One check of this file against pasted text. Nothing is saved. */
export async function POST(request: Request, { params }: Params) {
  try {
    const versionId = z.uuid().safeParse((await params).versionId);
    if (!versionId.success) throw new ApiError("Unknown résumé file.", 404);
    const { description, tool, terms } = bodySchema.parse(await readJson(request));
    return apiResponse(await scoreText(versionId.data, description, tool, terms));
  } catch (error) {
    if (error instanceof ToolError)
      return apiResponse({ error: error.message, code: error.code }, 502);
    return apiError(error);
  }
}
