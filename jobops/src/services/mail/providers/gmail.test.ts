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
it("keeps the frozen search query, continuation and at most five concurrent message reads", async () => {
  vi.spyOn(gmail, "accessToken").mockResolvedValue("access");
  let active = 0,
    peak = 0;
  const request = vi.fn(async (url: string) => {
    if (url.includes("messages?"))
      return Response.json({
        messages: Array.from({ length: 11 }, (_, i) => ({ id: `id${i}` })),
        nextPageToken: "next",
      });
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return Response.json({
      id: url.split("messages/")[1].split("?")[0],
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "Subject", value: "Interview invitation" },
          { name: "From", value: "Recruiter <person@example.invalid>" },
        ],
      },
    });
  });
  vi.stubGlobal("fetch", request);
  const connection = { lastSyncedAt: null } as Parameters<typeof gmail.listRecruitingMail>[0];
  const page = await gmail.listRecruitingMail(connection, {
    query: "frozen query",
    pageToken: "continue",
  });
  expect(new URL(request.mock.calls[0][0]).searchParams.get("q")).toBe("frozen query");
  expect(new URL(request.mock.calls[0][0]).searchParams.get("pageToken")).toBe("continue");
  expect(page.messages).toHaveLength(11);
  expect(peak).toBe(5);
  expect(page.nextCursor).toEqual({ pageToken: "next", query: "frozen query" });
});
