import { apiError, apiResponse } from "@/features/agent-api/http";
import { listRoundQuestions } from "@/features/interviews/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The application's rounds in order, each with its recorded questions. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return apiResponse({ rounds: await listRoundQuestions(id) });
  } catch (error) {
    return apiError(error);
  }
}
