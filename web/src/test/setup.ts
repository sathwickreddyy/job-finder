import "@testing-library/jest-dom";

// openapi-fetch internally uses `class CustomRequest extends Request`, capturing
// the `Request` global at module-import time. Node's undici Request rejects
// relative URLs ("/api/..."), but our api-client uses baseUrl="" so request paths
// are relative. Patch the global Request before any app module imports so
// relative URLs resolve against http://localhost/ during tests.
const RealRequest = globalThis.Request;
class PatchedRequest extends RealRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string" && input.startsWith("/")) {
      super(new URL(input, "http://localhost/").toString(), init);
    } else {
      super(input, init);
    }
  }
}
(globalThis as unknown as { Request: typeof Request }).Request =
  PatchedRequest as unknown as typeof Request;

// openapi-fetch captures globalThis.fetch at createClient() call time (import).
// Tests stub via vi.stubGlobal("fetch", ...), but openapi-fetch keeps its own
// reference — so stubs wouldn't reach it. Replace globalThis.fetch with a
// stable wrapper that re-reads globalThis.fetch on every call; per-test stubs
// will set that inner reference and the wrapper will forward.
const realFetch = globalThis.fetch.bind(globalThis);
(globalThis as unknown as { __realFetch: typeof fetch }).__realFetch = realFetch;

const delegatingFetch: typeof fetch = (...args) => {
  const current = (globalThis as unknown as { fetch: typeof fetch }).fetch;
  // If a test has stubbed fetch with a different function, call it.
  // Otherwise, fall back to the real fetch.
  if (current !== delegatingFetch) {
    return current(...args);
  }
  return realFetch(...args);
};
(globalThis as unknown as { fetch: typeof fetch }).fetch = delegatingFetch;
