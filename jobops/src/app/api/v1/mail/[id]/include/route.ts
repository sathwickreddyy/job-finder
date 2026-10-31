import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { includeMail } from "@/features/mail/include";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.strictObject({ company: z.string().trim().min(1).max(300) });

/** Include this: keep a dropped email (by ledger id) for `{ company }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company } = body.parse(await readJson(request));
    const result = await includeMail(id, company);
    for (const path of ["/mail", "/applications", "/companies", "/"]) revalidatePath(path);
    revalidatePath("/companies/[slug]", "page");
    return apiResponse(result);
  } catch (error) {
    return apiError(error);
  }
}
