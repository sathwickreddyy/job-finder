import { z } from "zod";
import { authorizeTask, TaskError } from "@/features/tasks/credentials";
import { apiError, boundedBody, privateHeaders } from "@/features/tasks/api";
import { taskResume, uploadTaskResume } from "@/features/tasks/uploads";
import { contentDisposition, readBuffer } from "@/services/storage";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorizeTask(request, id);
    const bytes = await boundedBody(request, 11 * 1024 * 1024);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new TaskError("Provide a PDF in the file field.");
    return Response.json(
      await uploadTaskResume(
        id,
        file,
        String(form.get("label") ?? "Proposed revision"),
        String(form.get("requestId") ?? ""),
      ),
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorizeTask(request, id);
    const version = await taskResume(
      id,
      z.uuid().parse(new URL(request.url).searchParams.get("versionId")),
    );
    const bytes = await readBuffer(version.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(version.originalFilename, false),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
