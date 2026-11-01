import { revalidatePath } from "next/cache";
import { apiError, apiResponse, readJson } from "@/features/agent-api/http";
import {
  agentRecordSchema,
  applicationQuerySchema,
  findApplications,
  recordAgentApplication,
} from "@/features/applications/agent-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Duplicate check before applying: `?url=` or `?company=`. */
export async function GET(request: Request) {
  try {
    const query = applicationQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiResponse({ applications: await findApplications(query) });
  } catch (error) {
    return apiError(error);
  }
}

/** Records an application the user confirmed they submitted; it never applies or sends anything. */
export async function POST(request: Request) {
  try {
    const result = await recordAgentApplication(agentRecordSchema.parse(await readJson(request)));
    revalidatePath("/", "layout");
    return apiResponse(result, result.duplicate ? 200 : 201);
  } catch (error) {
    return apiError(error);
  }
}
