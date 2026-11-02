import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError, apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { setDocxPath, versionPatchSchema } from "@/features/resumes/fit/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string }> };

/** Sets or clears where this version's editable DOCX lives (LAN-trusted, like /fit). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const versionId = z.uuid().safeParse((await params).versionId);
    if (!versionId.success) throw new ApiError("Unknown résumé file.", 404);
    const { docxPath } = versionPatchSchema.parse(await readJson(request));
    const result = await setDocxPath(versionId.data, docxPath);
    revalidatePath("/resumes");
    return apiResponse(result);
  } catch (error) {
    return apiError(error);
  }
}
