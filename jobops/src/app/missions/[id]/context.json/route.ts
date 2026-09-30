import { getMission } from "@/features/missions/service";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMission(id);
  if (!detail) return Response.json({ error: "Mission not found" }, { status: 404 });
  return Response.json(detail.context, {
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
