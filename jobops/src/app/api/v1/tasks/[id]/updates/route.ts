import { authorizeTask } from "@/features/tasks/credentials";
import { apiError, apiJson, privateHeaders } from "@/features/tasks/api";
import { reportTask } from "@/features/tasks/mutations";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorizeTask(request, id);
    return Response.json(await reportTask(id, await apiJson(request)), { headers: privateHeaders });
  } catch (error) {
    return apiError(error);
  }
}
