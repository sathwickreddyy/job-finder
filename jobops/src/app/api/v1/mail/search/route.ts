import { z } from "zod";
import { searchMail, MailSearchError } from "@/features/mail/search-service";
import { mailSearchRequestSchema } from "@/features/mail/search-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const response = (body: unknown, status = 200) => Response.json(body, { status, headers });

export function GET() {
  return response({
    method: "POST",
    path: "/api/v1/mail/search",
    request: z.toJSONSchema(mailSearchRequestSchema, { io: "input" }),
    examples: [
      { lastDays: 3 },
      { keywords: ["Amazon", "Amazon Jobs"], lastDays: 30 },
      { senders: ["recruiter@example.com"], subjects: ["interview"] },
    ],
    semantics:
      "OR within each field; AND between fields. Literal phrases, no raw operators or regex. Omit accounts for all connected accounts. Omit dates for all history before now. lastDays means rolling 24-hour days.",
    pagination:
      "POST {cursor: nextCursor} until complete. Each request fetches one page per account concurrently. Retry partial failures using nextCursor. limited means narrow the dates; do not claim complete coverage.",
    persistence:
      "Search only. No messages, seen state, application records or queue decisions are saved. Classification is advisory and does not suppress results.",
  });
}

export async function POST(request: Request) {
  if (request.headers.has("next-action"))
    return response({ error: "Server actions are not available on this API." }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    return response({ error: "Send application/json." }, 415);
  const reader = request.body?.getReader();
  if (!reader) return response({ error: "A JSON body is required." }, 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        return response({ error: "Request exceeds 64 KiB." }, 413);
      }
      chunks.push(value);
    }
    return response(await searchMail(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
  } catch (error) {
    if (error instanceof z.ZodError)
      return response(
        {
          error: "Invalid mail search.",
          issues: error.issues.map(({ path, message }) => ({ path, message })),
        },
        400,
      );
    if (error instanceof SyntaxError) return response({ error: "Malformed JSON." }, 400);
    if (error instanceof MailSearchError) return response({ error: error.message }, error.status);
    return response(
      { error: "Mail search could not run. Check local mail configuration and retry." },
      500,
    );
  } finally {
    reader.releaseLock();
  }
}
