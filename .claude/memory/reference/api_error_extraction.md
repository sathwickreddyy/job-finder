---
name: Frontend API error extraction pattern
description: openapi-fetch error shape is HTTPValidationError not the custom envelope; plan's error.error?.message is a type error — use error.detail?.[0]?.msg instead
type: reference
---

The FastAPI backend in this project installs a uniform error envelope via `app/api/errors.py` (returns `{error: {code, message, details}}`), but the **OpenAPI schema** that `openapi-typescript` regenerates from does NOT declare this shape per route — it only shows FastAPI's default 422 `HTTPValidationError` response (`{detail: ValidationError[]}`).

Result: when frontend code does `const { data, error } = await api.PATCH(...)`, the TypeScript type of `error` is the `HTTPValidationError` shape, and `error.error?.message` is a type error that breaks `npm run build`.

**The extraction pattern that works today:**

```ts
const { data, error } = await api.POST("/api/...", { body: {...} });
if (error) {
  throw new Error(error.detail?.[0]?.msg || "operation failed");
}
```

**Why:** `error.detail` on a 422 is a list of ValidationError objects, each with `msg`. For non-422 errors (e.g., a custom 404 raised via `HTTPException`), the runtime response body is `{error: {code, message, details}}` per `app/api/errors.py` — but the TS type still says `HTTPValidationError`, so we fall back to a static string. The fallback is user-visible, not user-facing — the actual backend message is logged or reachable via the envelope on the wire.

**Do NOT follow the plan's `error.error?.message` pattern** — it's a type error against the current generated types.

**Future fix (out of scope for the current plan):** declare `responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}}` on each route so the OpenAPI schema matches the runtime envelope, and rebuild `api-types.ts`. Then `error.error?.message` will type-check correctly. Plan Tasks 21-28 should keep using the `detail?.[0]?.msg` pattern until that fix lands.
