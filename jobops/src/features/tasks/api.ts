import { ZodError } from "zod";
import { actionError } from "@/lib/actions";
import { TaskError } from "./credentials";
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export function apiError(error: unknown) {
  const status =
    error instanceof TaskError
      ? error.status
      : error instanceof ZodError || error instanceof SyntaxError
        ? 400
        : 500;
  return Response.json(
    { error: error instanceof TaskError ? error.message : actionError(error).error },
    { status, headers: privateHeaders },
  );
}
export async function boundedBody(request: Request, limit = 512 * 1024) {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new TaskError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new TaskError("A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new TaskError("Request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function apiJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new TaskError("Send application/json.", 415);
  return JSON.parse((await boundedBody(request)).toString("utf8")) as unknown;
}
