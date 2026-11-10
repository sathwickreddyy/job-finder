import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError, apiError, apiResponse, readJson } from "@/features/agent-api/http";
import {
  readApplicationTransitions,
  transitionApplication,
} from "@/features/applications/transition-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function applicationId({ params }: Context) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError("Application not found.", 404);
  return id;
}

export async function GET(_request: Request, context: Context) {
  try {
    return apiResponse(await readApplicationTransitions(await applicationId(context)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const id = await applicationId(context);
    const result = await transitionApplication(id, await readJson(request));
    for (const path of ["/applications", `/applications/${id}`, "/mail", "/companies", "/"])
      revalidatePath(path);
    return apiResponse(result);
  } catch (error) {
    return apiError(error);
  }
}
