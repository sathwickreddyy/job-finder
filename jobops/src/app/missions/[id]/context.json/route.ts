export function GET() {
  return Response.json({ error: "This workflow has been removed." }, { status: 410 });
}
