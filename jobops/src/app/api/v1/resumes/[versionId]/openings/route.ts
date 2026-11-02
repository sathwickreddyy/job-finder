import { z } from "zod";
import { ApiError, apiError, apiResponse } from "@/features/agent-api/http";
import { listScorableOpenings } from "@/features/resumes/score/openings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string }> };

/** Saved openings this file can be scored against, newest posting first. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const versionId = z.uuid().safeParse((await params).versionId);
    if (!versionId.success) throw new ApiError("Unknown résumé file.", 404);
    return apiResponse({ openings: await listScorableOpenings(versionId.data) });
  } catch (error) {
    return apiError(error);
  }
}
