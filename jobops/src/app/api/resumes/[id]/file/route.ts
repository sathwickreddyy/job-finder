import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { resumeVersions } from "@/db/schema";
import { contentDisposition, readBuffer } from "@/services/storage";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Invalid resume version." }, { status: 400 });
  const [version] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, id));
  if (!version) return Response.json({ error: "Resume version was not found." }, { status: 404 });
  try {
    const bytes = await readBuffer(version.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": contentDisposition(
          version.originalFilename,
          !new URL(request.url).searchParams.has("download"),
        ),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "The stored PDF is unavailable. Check STORAGE_ROOT and restore the upload from your backup.",
      },
      { status: 404 },
    );
  }
}
