import createClient from "openapi-fetch";
import type { paths } from "./api-types";

// Relative base URL — the Vite dev server proxies /api → :47131,
// and in prod nginx does the same. Never hardcode the host.
export const api = createClient<paths>({ baseUrl: "" });

export type Schemas = paths;

/**
 * Pull a user-facing message out of whatever the API returned in `error`.
 *
 * Backend error envelope (see app/api/errors.py) is the primary shape:
 *   { error: { code, message, details } }
 *
 * FastAPI's request-validation error (HTTPValidationError) is:
 *   { detail: [{ msg, ... }] }
 *
 * Plus a bare `{ detail: "..." }` shape that FastAPI uses for raw HTTPException
 * before our install_error_handlers wraps it in the envelope.
 *
 * We try each shape in order and fall back to the provided string. Centralizing
 * this is what makes the memory note `api_error_extraction.md` accurate again.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apiErrorMessage(error: any, fallback = "request failed"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  // Envelope: { error: { message } }
  if (error.error && typeof error.error.message === "string") {
    return error.error.message;
  }
  // HTTPValidationError: { detail: [{ msg }] }
  if (Array.isArray(error.detail) && error.detail[0]?.msg) {
    return String(error.detail[0].msg);
  }
  // Bare detail string
  if (typeof error.detail === "string") return error.detail;
  return fallback;
}
