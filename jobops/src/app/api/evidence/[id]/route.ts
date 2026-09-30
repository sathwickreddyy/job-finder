import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { missionEvidence } from "@/db/schema";
import { contentDisposition, readBuffer } from "@/services/storage";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Evidence not found" }, { status: 404 });
  const [evidence] = await db.select().from(missionEvidence).where(eq(missionEvidence.id, id));
  if (!evidence?.storagePath) return Response.json({ error: "Evidence file not found" }, { status: 404 });
  try {
    const bytes = await readBuffer(evidence.storagePath);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": typeof evidence.metadata.mimeType === "string" ? evidence.metadata.mimeType : "application/octet-stream", "Content-Disposition": contentDisposition(evidence.value), "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "Evidence file unavailable. Restore its storage backup and retry." }, { status: 404 }); }
}
