import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError, apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { fitInputSchema, getFit, recordFit } from "@/features/resumes/fit/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string }> };
const unknownFile = () => new ApiError("Unknown résumé file.", 404);
async function versionIdFrom({ params }: Params) {
  const parsed = z.uuid().safeParse((await params).versionId);
  if (!parsed.success) throw unknownFile();
  return parsed.data;
}

/** The job a tailored file targets, its saved description and the latest tool checks. */
export async function GET(_request: Request, context: Params) {
  try {
    const fit = await getFit(await versionIdFrom(context));
    if (!fit) throw unknownFile();
    return apiResponse(fit);
  } catch (error) {
    return apiError(error);
  }
}

/** Records the target and tool checks the agent ran; it never scores anything itself. */
export async function POST(request: Request, context: Params) {
  try {
    const versionId = await versionIdFrom(context);
    const input = fitInputSchema.parse(await readJson(request, 1024 * 1024));
    const result = await recordFit(versionId, input);
    revalidatePath("/resumes");
    return apiResponse(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
