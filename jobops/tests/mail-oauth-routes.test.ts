import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as connect } from "../src/app/api/mail/[provider]/connect/route";
import { GET as callback } from "../src/app/api/mail/[provider]/callback/route";
const { exchangeCode, saveConnection, configured } = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  saveConnection: vi.fn(),
  configured: { value: true },
}));
vi.mock("@/services/mail/providers/connections", () => ({ saveConnection }));
vi.mock("@/services/mail/providers", () => ({
  providerBySlug: (slug: string) => {
    if (slug !== "gmail") throw new Error("Unknown provider");
    return {
      id: "GMAIL",
      slug,
      label: "Gmail",
      configuration: () => ({ configured: configured.value, missing: ["TEST_CONFIG"] }),
      exchangeCode,
      authorizeUrl: (state: string, challenge: string) =>
        new URL(`https://provider.example/authorize?state=${state}&code_challenge=${challenge}`),
    };
  },
}));
const origin = "http://127.0.0.1:3210";
const params = (provider = "gmail") => ({ params: Promise.resolve({ provider }) });
const verifier = "a".repeat(64);
function request(
  overrides: Record<string, unknown> = {},
  value = verifier,
  query = "state=nonce&code=code",
  host = origin,
) {
  const stored = {
    state: "nonce",
    provider: "gmail",
    expiresAt: Date.now() + 300_000,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    ...overrides,
  };
  const request = new NextRequest(`${host}/api/mail/gmail/callback?${query}`);
  request.cookies.set("jobops_mail_state", JSON.stringify(stored));
  request.cookies.set("jobops_mail_verifier", value);
  return request;
}
beforeEach(() => {
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("__NEXT_NO_MIDDLEWARE_URL_NORMALIZE", "1");
  configured.value = true;
  exchangeCode.mockResolvedValue({ email: "one@example.invalid", tokens: {} });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("canonicalizes aliases before creating any OAuth cookies", async () => {
  const result = await connect(
    new NextRequest("http://localhost:3210/api/mail/gmail/connect?return=https://evil.invalid"),
    params(),
  );
  expect(result.headers.get("location")).toBe(`${origin}/api/mail/gmail/connect`);
  expect(result.cookies.getAll()).toEqual([]);
});
it("binds nonce, provider, expiry and PKCE cookies and exchanges the same verifier", async () => {
  const result = await connect(new NextRequest(`${origin}/api/mail/gmail/connect`), params());
  const state = result.cookies.get("jobops_mail_state")!;
  const pkce = result.cookies.get("jobops_mail_verifier")!;
  const binding = JSON.parse(state.value);
  expect(binding.provider).toBe("gmail");
  expect(state.httpOnly).toBe(true);
  expect(state.sameSite).toBe("lax");
  expect(binding.challenge).toBe(createHash("sha256").update(pkce.value).digest("base64url"));
  const req = new NextRequest(`${origin}/api/mail/gmail/callback?state=${binding.state}&code=code`);
  req.cookies.set(state);
  req.cookies.set(pkce);
  const done = await callback(req, params());
  expect(exchangeCode).toHaveBeenCalledWith("code", pkce.value);
  expect(saveConnection).toHaveBeenCalledTimes(1);
  expect(done.cookies.get("jobops_mail_state")?.maxAge).toBe(0);
  expect(new URL(done.headers.get("location")!).origin).toBe(origin);
});
it.each([
  { state: "wrong" },
  { provider: "outlook" },
  { expiresAt: 0 },
  { expiresAt: Date.now() + 900_000 },
  { challenge: "wrong" },
])("rejects invalid binding %j without OAuth calls", async (binding) => {
  const result = await callback(request(binding), params());
  expect(exchangeCode).not.toHaveBeenCalled();
  expect(result.headers.get("location")).toContain("could%20not%20be%20verified");
});
it.each(["", "short", "b".repeat(64)])(
  "rejects missing/invalid/replaced verifier",
  async (value) => {
    await callback(request({}, value), params());
    expect(exchangeCode).not.toHaveBeenCalled();
  },
);
it("rejects denied consent, missing code and wrong host", async () => {
  await callback(request({}, verifier, "state=nonce&error=denied&code=code"), params());
  await callback(request({}, verifier, "state=nonce"), params());
  const result = await callback(
    request({}, verifier, "state=nonce&code=code", "http://evil.invalid"),
    params(),
  );
  expect(exchangeCode).not.toHaveBeenCalled();
  expect(new URL(result.headers.get("location")!).origin).toBe(origin);
});
it("fails closed for unknown providers and invalid configuration", async () => {
  expect(
    (await connect(new NextRequest(`${origin}/api/mail/unknown/connect`), params("unknown")))
      .status,
  ).toBe(404);
  expect((await callback(request(), params("unknown"))).status).toBe(404);
  configured.value = false;
  await callback(request(), params());
  expect(exchangeCode).not.toHaveBeenCalled();
  vi.stubEnv("APP_URL", "http://evil.invalid");
  expect((await callback(request(), params())).status).toBe(503);
});
it("never redirects provider error credentials into the browser URL", async () => {
  exchangeCode.mockRejectedValueOnce(new Error("access_token=SECRET"));
  const result = await callback(request(), params());
  expect(result.headers.get("location")).not.toContain("SECRET");
});
