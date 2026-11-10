import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiResponse, ApiError, readJson } from "@/features/agent-api/http";
import { handleMail, handleSchema } from "@/features/mail/handle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run a mail transition or record an application outcome from the email. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError("Email not found.", 404);
    const item = await handleMail(id, handleSchema.parse(await readJson(request)));
    for (const path of ["/mail", "/applications", "/companies", "/"]) revalidatePath(path);
    return apiResponse({ item });
  } catch (error) {
    return apiError(error);
  }
}
