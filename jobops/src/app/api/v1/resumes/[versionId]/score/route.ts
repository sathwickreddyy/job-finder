import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError, apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { TOOL_SOURCES } from "@/features/resumes/fit/tools";
import { scoreVersion } from "@/features/resumes/score/run";
import { ToolError } from "@/features/resumes/score/tool-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string }> };
const bodySchema = z.strictObject({ snapshotId: z.uuid(), tool: z.enum(TOOL_SOURCES) });

/** Runs one tool for this file (and its base when needed) against a saved description. */
export async function POST(request: Request, { params }: Params) {
  try {
    const versionId = z.uuid().safeParse((await params).versionId);
    if (!versionId.success) throw new ApiError("Unknown résumé file.", 404);
    const { snapshotId, tool } = bodySchema.parse(await readJson(request));
    const result = await scoreVersion(versionId.data, snapshotId, tool);
    revalidatePath("/resumes");
    return apiResponse(result, 201);
  } catch (error) {
    if (error instanceof ToolError)
      return apiResponse({ error: error.message, code: error.code }, 502);
    return apiError(error);
  }
}
