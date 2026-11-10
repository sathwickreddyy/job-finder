import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError, apiError, apiResponse } from "@/features/agent-api/http";
import { listResumeFiles } from "@/features/applications/agent-record";
import { docxPathSchema } from "@/features/resumes/fit/service";
import { resumeFileHref } from "@/features/resumes/links";
import { listMasterSources } from "@/features/resumes/master/service";
import { ResumeUploadFamilyNotFound, uploadResumeVersion } from "@/features/resumes/service";
import { PdfValidationError } from "@/services/pdf";
import { MAX_UPLOAD_BYTES } from "@/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadLimit = MAX_UPLOAD_BYTES + 128 * 1024;
const uploadFields = z.strictObject({
  file: z.file().min(1),
  resumeId: z.uuid(),
  versionLabel: z.string().trim().min(1).max(80),
  changeNotes: z.string().max(20000).optional(),
  docxPath: docxPathSchema.optional(),
});

async function readUpload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType))
    throw new ApiError("Send the PDF as multipart form data.", 415);
  const tooLarge = new ApiError("Upload a PDF up to 10 MiB.", 413);
  if (Number(request.headers.get("content-length") ?? 0) > uploadLimit) throw tooLarge;
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Choose a PDF to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > uploadLimit) {
        await reader.cancel();
        throw tooLarge;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const form = await new Response(Buffer.concat(chunks), {
    headers: { "content-type": contentType },
  })
    .formData()
    .catch(() => {
      throw new ApiError("Invalid multipart upload.");
    });
  const fields = Array.from(form.entries());
  if (new Set(fields.map(([name]) => name)).size !== fields.length)
    throw new ApiError("Send each upload field once.");
  const input = uploadFields.parse(Object.fromEntries(fields));
  if (input.file.size > MAX_UPLOAD_BYTES) throw tooLarge;
  return input;
}

/** Resume files an application record can reference, current versions first. */
export async function GET() {
  try {
    const [resumes, masters] = await Promise.all([listResumeFiles(), listMasterSources()]);
    return apiResponse({ resumes, masters });
  } catch (error) {
    return apiError(error);
  }
}

/** Store an existing PDF as a separate, non-default version. The client supplies the file bytes. */
export async function POST(request: Request) {
  try {
    const input = await readUpload(request);
    const version = await uploadResumeVersion({
      ...input,
      makeCurrent: false,
      draft: true,
      reuseExisting: true,
    });
    if (!version.duplicate) {
      revalidatePath("/resumes");
      revalidatePath("/companies");
      revalidatePath("/");
    }
    return apiResponse(
      {
        versionId: version.id,
        resumeId: version.resumeId,
        sha256: version.sha256,
        isCurrent: version.isCurrent,
        parsingStatus: version.parsingStatus,
        parsingError: version.parsingError,
        duplicate: version.duplicate,
        url: resumeFileHref(version.id),
        downloadUrl: `/api/resumes/${version.id}/file?download=1`,
      },
      version.duplicate ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof PdfValidationError) return apiError(new ApiError(error.message));
    if (error instanceof ResumeUploadFamilyNotFound)
      return apiError(new ApiError(error.message, 404));
    return apiError(error);
  }
}
