import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeGoogleCode, gmailConfiguration, GMAIL_READONLY_SCOPE } from "./gmail";
function configure(origin = "http://127.0.0.1:3210") {
  vi.stubEnv("APP_URL", origin); vi.stubEnv("GOOGLE_CLIENT_ID", "test-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret"); vi.stubEnv("GOOGLE_REDIRECT_URI", `${origin}/api/gmail/callback`); vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Gmail read-only OAuth boundary", () => {
  it("requires a complete key and same-origin callback", () => { configure(); expect(gmailConfiguration().configured).toBe(true); vi.stubEnv("GOOGLE_REDIRECT_URI", "https://other.example/api/gmail/callback"); expect(gmailConfiguration().configured).toBe(false); configure(); vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", ""); expect(gmailConfiguration().configured).toBe(false); });
  it("allows loopback HTTP but requires HTTPS for public callbacks", () => { configure("http://jobops.example"); expect(gmailConfiguration().configured).toBe(false); configure("https://jobops.example"); expect(gmailConfiguration().configured).toBe(true); });
  it("rejects additional OAuth scopes before reading or storing account data", async () => { configure(); const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "test-access", scope: `${GMAIL_READONLY_SCOPE} https://www.googleapis.com/auth/gmail.send` }), { status: 200 })); vi.stubGlobal("fetch", request); await expect(exchangeGoogleCode("code", "verifier")).rejects.toThrow("permissions other than gmail.readonly"); expect(request).toHaveBeenCalledTimes(1); const options = request.mock.calls[0][1] as RequestInit; expect((options.body as URLSearchParams).get("code_verifier")).toBe("verifier"); });
});
