---
name: Frontend API error extraction helper
description: Use apiErrorMessage() from web/src/lib/api-client.ts to pull human-readable messages from API errors; handles envelope + HTTPValidationError + bare detail
type: reference
originSessionId: 7541074f-e90a-4c55-be66-749ef29632ce
---
Use `apiErrorMessage(error, fallback)` from `web/src/lib/api-client.ts` for every `if (error) throw new Error(...)` path. The helper accepts the unknown `error` shape from openapi-fetch and tries three shapes in order:

1. **Backend envelope** (from `app/api/errors.py`): `{ error: { code, message, details } }` — the canonical shape for runtime HTTPException and unhandled 500s.
2. **FastAPI validation error**: `{ detail: [{ msg, ... }] }` — what 422s look like.
3. **Bare FastAPI detail string**: `{ detail: "..." }` — occasionally surfaces when a response precedes the error-handler middleware.

Falls back to the caller-supplied string if none match.

**Use:**

```ts
import { api, apiErrorMessage } from "../lib/api-client";

const { data, error } = await api.POST("/api/...", { body: {...} });
if (error) throw new Error(apiErrorMessage(error, "operation failed"));
```

**Do NOT** write `error.detail?.[0]?.msg` directly — it misses the envelope shape and returns the fallback for every 500 raised via `HTTPException`, which is what the user actually cares about seeing.

**Do NOT** write `error.error?.message` directly either — generated `api-types.ts` types `error` as `HTTPValidationError`, so that's a TS build error.

History: the first pass only handled `detail?.[0]?.msg` because the backend envelope wasn't wired up yet. Once `install_error_handlers` landed, every call site needed to also read the envelope shape. Centralizing in `apiErrorMessage` keeps the two shapes in one place.
