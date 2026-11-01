import { apiError, apiResponse } from "@/features/agent-api/http";
import { listMail, mailListSchema } from "@/features/mail/mail-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const filters = mailListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return apiResponse(await listMail(filters));
  } catch (error) {
    return apiError(error);
  }
}
