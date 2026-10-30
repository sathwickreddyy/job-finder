import { z } from "zod";
import { searchMail } from "@/features/mail/search-service";
import { runSearchRequest } from "@/features/mail/search-http";
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
  return runSearchRequest(request, searchMail);
}
