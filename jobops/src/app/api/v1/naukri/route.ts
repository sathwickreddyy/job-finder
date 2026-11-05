import { revalidatePath } from "next/cache";
import { apiError, apiResponse, readJson, refusal } from "@/features/agent-api/http";
import {
  naukriUpdateSchema,
  readNaukriStatus,
  recordNaukriUpdate,
} from "@/features/workspace/naukri-updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the Naukri profile was updated today, plus the last fourteen days. */
export async function GET() {
  try {
    return apiResponse({ naukri: await readNaukriStatus() });
  } catch (error) {
    return apiError(error);
  }
}

/** Records an update the agent verified on Naukri; it never edits Naukri itself. */
export async function POST(request: Request) {
  try {
    const status = await recordNaukriUpdate(naukriUpdateSchema.parse(await readJson(request)));
    revalidatePath("/", "layout");
    return apiResponse({ naukri: status }, 201);
  } catch (error) {
    return apiError(refusal(error));
  }
}
