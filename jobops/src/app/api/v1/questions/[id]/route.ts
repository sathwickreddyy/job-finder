import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { updateQuestion } from "@/features/interviews/questions";
import { revalidateQuestions } from "@/features/interviews/revalidate";
import { db } from "@/db";
import { applicationRounds } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Updates the named fields of one question, including `review` with its `reviewSource`. */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const question = await updateQuestion(id, await readJson(request, 1024 * 1024));
    const [round] = await db
      .select({ applicationId: applicationRounds.applicationId })
      .from(applicationRounds)
      .where(eq(applicationRounds.id, question.roundId));
    revalidateQuestions(round?.applicationId);
    return apiResponse({ question });
  } catch (error) {
    return apiError(error);
  }
}
