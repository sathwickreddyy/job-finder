import { z } from "zod";
import { apiError } from "@/features/agent-api/http";
import { masterRevisionFile } from "@/features/resumes/master/service";
import { contentDisposition, readBuffer } from "@/services/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const versionId = z.uuid().parse((await params).versionId);
    const query = new URL(request.url).searchParams;
    const revisionId = query.get("revision");
    if (revisionId) z.uuid().parse(revisionId);
    const file = await masterRevisionFile(versionId, revisionId, query.get("format") === "pdf");
    const bytes = await readBuffer(file.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": contentDisposition(file.filename, query.get("format") === "pdf"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
