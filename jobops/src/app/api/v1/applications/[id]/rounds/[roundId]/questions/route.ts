import { z } from "zod";
import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { addQuestions } from "@/features/interviews/questions";
import { revalidateQuestions } from "@/features/interviews/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; roundId: string }> };

const body = z.strictObject({ questions: z.array(z.unknown()).min(1).max(20) });

/** Appends questions after the round's last one; returns their ids in order. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { id, roundId } = await params;
    const { questions } = body.parse(await readJson(request, 1024 * 1024));
    const ids = await addQuestions(id, roundId, questions);
    revalidateQuestions(id);
    return apiResponse({ ids }, 201);
  } catch (error) {
    return apiError(error);
  }
}
