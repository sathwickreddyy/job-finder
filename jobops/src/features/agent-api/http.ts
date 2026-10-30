import { ZodError } from "zod";

/** A deliberate agent API refusal; `details` are merged into the JSON body. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const limit = 64 * 1024;

export function apiResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers });
}

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.has("next-action"))
    throw new ApiError("Server actions are not available on this API.", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("Send application/json.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new ApiError("Request exceeds 64 KiB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError("Request exceeds 64 KiB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError)
    return apiResponse({ error: error.message, ...error.details }, error.status);
  if (error instanceof ZodError)
    return apiResponse(
      {
        error: "Invalid request.",
        issues: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      },
      400,
    );
  if (error instanceof SyntaxError) return apiResponse({ error: "Malformed JSON." }, 400);
  return apiResponse(
    { error: "JobOps could not complete this request. Check the local database and retry." },
    500,
  );
}
