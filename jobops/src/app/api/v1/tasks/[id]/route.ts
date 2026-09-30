import { authorizeTask, TaskError } from "@/features/tasks/credentials";
import { apiError, privateHeaders } from "@/features/tasks/api";
import { taskContext } from "@/features/tasks/read";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorizeTask(request, id);
    const context = await taskContext(id);
    if (!context) throw new TaskError("Task not found.", 404);
    return Response.json(context, { headers: privateHeaders });
  } catch (error) {
    return apiError(error);
  }
}
