import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jobSnapshots } from "@/db/schema";
import { ApiError, apiError, apiResponse } from "@/features/agent-api/http";
import { suggestTerms } from "@/features/resumes/score/scoring-client";
import { ToolError } from "@/features/resumes/score/tool-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ snapshotId: string }> };

/** The scoring service's catalogue terms for this saved description, each with its line. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const id = z.uuid().safeParse((await params).snapshotId);
    const [snapshot] = id.success
      ? await db.select().from(jobSnapshots).where(eq(jobSnapshots.id, id.data))
      : [];
    if (!snapshot) throw new ApiError("Unknown job description.", 404);
    return apiResponse({ terms: await suggestTerms(snapshot.description) });
  } catch (error) {
    if (error instanceof ToolError)
      return apiResponse({ error: error.message, code: error.code }, 502);
    return apiError(error);
  }
}
