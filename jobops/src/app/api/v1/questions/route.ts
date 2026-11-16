import { apiError, apiResponse } from "@/features/agent-api/http";
import { readLibrary } from "@/features/interviews/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The question library: `q`, `company`, `pattern`, `outcome`, `limit` and `cursor`. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = Object.fromEntries(
      ["q", "company", "pattern", "outcome", "limit", "cursor"]
        .map((key) => [key, params.get(key)] as const)
        .filter(([, value]) => value !== null && value !== ""),
    );
    return apiResponse(await readLibrary(query));
  } catch (error) {
    return apiError(error);
  }
}
