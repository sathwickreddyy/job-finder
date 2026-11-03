import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError, apiError, apiResponse } from "@/features/agent-api/http";
import { appendMasterRevision, getMaster } from "@/features/resumes/master/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ versionId: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const id = z.uuid().parse((await params).versionId);
    const master = await getMaster(id);
    if (!master) throw new ApiError("No master source has been recorded for this file.", 404);
    return apiResponse({ master });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const id = z.uuid().parse((await params).versionId);
    const limit = 22 * 1024 * 1024;
    if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? ""))
      throw new ApiError("Send the master DOCX as multipart form data.", 415);
    if (Number(request.headers.get("content-length") ?? 0) > limit)
      throw new ApiError("Master upload exceeds 22 MiB.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError("Send a DOCX and change reason as multipart form data.");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new ApiError("Master upload exceeds 22 MiB.", 413);
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const form = await new Response(Buffer.concat(parts), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    })
      .formData()
      .catch(() => {
        throw new ApiError("Invalid multipart upload. Choose the DOCX and retry.");
      });
    const file = form.get("file"),
      pdf = form.get("pdf");
    if (!(file instanceof File) || !file.size)
      throw new ApiError("Choose the editable DOCX master.");
    const revision = await appendMasterRevision(id, {
      file,
      pdf: pdf instanceof File && pdf.size ? pdf : undefined,
      reason: String(form.get("reason") ?? ""),
      expectedRevisionId: String(form.get("expectedRevisionId") ?? "") || null,
      sourceDate: String(form.get("sourceDate") ?? "") || undefined,
      removedDisposition: z
        .enum(["retained", "incorrect"])
        .parse(form.get("removedDisposition") ?? "retained"),
    });
    revalidatePath("/resumes");
    return apiResponse({ revision }, 201);
  } catch (error) {
    if (
      error instanceof Error &&
      /DOCX|readable document text|Choose a|PDF/.test(error.message) &&
      !(error instanceof ApiError)
    )
      return apiError(new ApiError(error.message, 400));
    return apiError(error);
  }
}
