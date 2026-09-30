import { ZodError } from "zod";
export type ActionState = { error?: string; success?: string; redirect?: string };
export function formString(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
export function formJson(form: FormData, key: string, fallback: unknown = {}) {
  const value = formString(form, key);
  return value ? (JSON.parse(value) as unknown) : fallback;
}
export function actionError(error: unknown): ActionState {
  if (error instanceof ZodError)
    return {
      error: error.issues.map((i) => `${i.path.join(".") || "Input"}: ${i.message}`).join("; "),
    };
  if (error instanceof SyntaxError)
    return { error: "JSON could not be read. Check quotation marks, commas and brackets." };
  if (error instanceof Error) {
    const safeCodes: Record<string, string> = {
      "23505": "A record with those details already exists.",
      "23503": "The linked record no longer exists. Refresh the page and choose again.",
      ECONNREFUSED: "Database unavailable. Start PostgreSQL with docker compose up -d, then retry.",
    };
    const code =
      (error as Error & { code?: string; cause?: { code?: string } }).code ??
      (error as Error & { cause?: { code?: string } }).cause?.code;
    if (code && safeCodes[code]) return { error: safeCodes[code] };
    if (/Failed query|password|postgres|token|secret/i.test(error.message))
      return {
        error: "The change could not be saved. Check the local database/configuration and retry.",
      };
    return { error: error.message };
  }
  return { error: "The change could not be saved. Check your input and retry." };
}
