import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError, apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { writeApplicationNotes } from "@/features/applications/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const body = z.object({ notes: z.string() });

/** Replaces the application's Markdown notes and returns the saved text. */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError("Application not found.", 404);
    const { notes } = body.parse(await readJson(request, 1024 * 1024));
    const saved = await writeApplicationNotes(id, notes);
    for (const path of ["/applications", `/applications/${id}`, "/companies", "/"])
      revalidatePath(path);
    return apiResponse({ notes: saved });
  } catch (error) {
    return apiError(error);
  }
}
