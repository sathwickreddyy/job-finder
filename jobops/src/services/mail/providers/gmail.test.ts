import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gmail, GMAIL_READONLY_SCOPE } from "./gmail";
import { providerFor, providerBySlug } from "./index";
function configure() {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
  vi.stubEnv("GOOGLE_CLIENT_ID", "id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:3210/api/mail/gmail/callback");
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
}
beforeEach(configure);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("requests only readonly with PKCE and refuses unknown providers", () => {
  const url = gmail.authorizeUrl("state", "challenge");
  expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("include_granted_scopes")).toBe("false");
  expect(() => providerFor("INVALID")).toThrow("Unknown or unavailable");
  expect(() => providerBySlug("invalid")).toThrow("Unknown or unavailable");
});
it.each([
  undefined,
  "",
  " ",
  "openid",
  `${GMAIL_READONLY_SCOPE} https://www.googleapis.com/auth/gmail.send`,
])("denies initial missing or unexpected scope %s before profile lookup", async (scope) => {
  const request = vi.fn().mockResolvedValue(Response.json({ access_token: "access", scope }));
  vi.stubGlobal("fetch", request);
  await expect(gmail.exchangeCode("code", "verifier")).rejects.toThrow(
    "permissions other than gmail.readonly",
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect((request.mock.calls[0][1].body as URLSearchParams).get("code_verifier")).toBe("verifier");
});
it.each(["", "openid", `${GMAIL_READONLY_SCOPE} https://www.googleapis.com/auth/gmail.modify`])(
  "denies provided invalid refresh grants %s",
  async (scope) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ access_token: "access", scope })),
    );
    await expect(gmail.refreshTokens("refresh")).rejects.toThrow(
      "permissions other than gmail.readonly",
    );
  },
);
it("accepts omitted refresh scopes and preserves rotated refresh token", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ access_token: "access", refresh_token: "rotated", expires_in: 120 }),
      ),
  );
  expect(await gmail.refreshTokens("refresh")).toMatchObject({
    accessToken: "access",
    refreshToken: "rotated",
  });
});
it.each([
  { access_token: 42 },
  { access_token: "" },
  { access_token: "access", expires_in: -1 },
  { access_token: "access", refresh_token: 23 },
  { access_token: "access", token_type: "basic" },
])("rejects malformed token fields without returning credentials", async (fields) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ...fields, scope: GMAIL_READONLY_SCOPE })),
  );
  await expect(gmail.exchangeCode("code", "verifier")).rejects.toThrow("invalid token response");
});
it("keeps a mail with many To addresses within the import display limit", async () => {
  const recipient = Array.from({ length: 45 }, (_, i) => `candidate${i}@example.invalid`).join(
    ", ",
  );
  vi.spyOn(gmail, "accessToken").mockResolvedValue("access");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("messages?")
          ? { messages: [{ id: "many-recipients" }] }
          : {
              id: "many-recipients",
              internalDate: "1700000000000",
              payload: {
                headers: [
                  { name: "Subject", value: "Interview invitation" },
                  { name: "From", value: "talent@example.invalid" },
                  { name: "To", value: recipient },
                ],
              },
            },
      ),
    ),
  );
  const page = await gmail.scanMail(
    {} as Parameters<typeof gmail.scanMail>[0],
    { until: "2026-10-30T00:00:00Z" },
    [],
  );
  expect(page.messages).toHaveLength(1);
  expect(page.messages[0]).toMatchObject({
    externalId: "many-recipients",
    recipient: recipient.slice(0, 999) + "…",
  });
});
