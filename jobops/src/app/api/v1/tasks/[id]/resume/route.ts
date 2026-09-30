export function GET() {
  return Response.json(
    { error: "Agent task access has been removed. Use the prompt pages." },
    { status: 410 },
  );
}
export const POST = GET;
