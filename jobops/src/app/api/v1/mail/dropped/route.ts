import { z } from "zod";
import { apiError, apiResponse } from "@/features/agent-api/http";
import { listDropped } from "@/features/mail/dropped";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({
  since: z.iso.datetime({ offset: true }),
  company: z.string().trim().min(1).max(300).optional(),
});

/** Dropped mail decided since `since`, with the reason for each; `company` narrows it. */
export async function GET(request: Request) {
  try {
    const filter = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    return apiResponse({ items: await listDropped(filter) });
  } catch (error) {
    return apiError(error);
  }
}
