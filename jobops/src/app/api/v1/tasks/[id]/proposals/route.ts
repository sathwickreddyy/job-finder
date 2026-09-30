import { authorizeTask } from "@/features/tasks/credentials";
import { apiError, apiJson, privateHeaders } from "@/features/tasks/api";
import { proposeTask } from "@/features/tasks/mutations";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorizeTask(request, id);
    const proposal = await proposeTask(id, await apiJson(request));
    return Response.json(proposal, { status: 201, headers: privateHeaders });
  } catch (error) {
    return apiError(error);
  }
}
