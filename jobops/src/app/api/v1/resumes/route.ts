import { apiError, apiResponse } from "@/features/agent-api/http";
import { listResumeFiles } from "@/features/applications/agent-record";
import { listMasterSources } from "@/features/resumes/master/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resume files an application record can reference, current versions first. */
export async function GET() {
  try {
    const [resumes, masters] = await Promise.all([listResumeFiles(), listMasterSources()]);
    return apiResponse({ resumes, masters });
  } catch (error) {
    return apiError(error);
  }
}
