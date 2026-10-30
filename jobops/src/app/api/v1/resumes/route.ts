import { apiError, apiResponse } from "@/features/agent-api/http";
import { listResumeFiles } from "@/features/applications/agent-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resume files an application record can reference, current versions first. */
export async function GET() {
  try {
    return apiResponse({ resumes: await listResumeFiles() });
  } catch (error) {
    return apiError(error);
  }
}
