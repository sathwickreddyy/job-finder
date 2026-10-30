import { z } from "zod";
import { MailSearchError } from "./search-service";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export const mailSearchResponse = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
const response = mailSearchResponse;
export async function runSearchRequest(
  request: Request,
  search: (input: unknown) => Promise<unknown>,
) {
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
    return response(await search(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
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
