import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outlook, OUTLOOK_SCOPES, readOnlyScopes } from "./outlook";
import { providerFor, providerBySlug } from "./index";
import type { MailConnection } from "./types";
import { outlookSearchQuery, type SearchRequest } from "./search-query";

const origin = "http://127.0.0.1:3210";
const connection = { lastSyncedAt: new Date("2026-10-02T00:00:00Z") } as MailConnection;
const message = (patch: Record<string, unknown> = {}) => ({
  id: "AAMk-MovedID",
  internetMessageId: "<abc@mail.example>",
  conversationId: "conv-1",
  subject: "Interview invitation for SDE-2",
  bodyPreview: "We would like to schedule an interview",
  body: { contentType: "text", content: "We would like to schedule your interview with our team." },
  from: { emailAddress: { name: "Talent Team", address: "talent@example.invalid" } },
  toRecipients: [{ emailAddress: { address: "person@outlook.in" } }],
  receivedDateTime: "2026-10-03T03:30:00Z",
  ...patch,
});
beforeEach(() => {
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("MICROSOFT_CLIENT_ID", "test-client");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-secret");
  vi.stubEnv("MICROSOFT_REDIRECT_URI", `${origin}/api/mail/outlook/callback`);
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Outlook read-only OAuth", () => {
  it("registers both lookups and requests personal accounts, PKCE and account selection", () => {
    expect(providerFor("OUTLOOK")).toBe(outlook);
    expect(providerBySlug("outlook")).toBe(outlook);
    expect(() => providerFor("OTHER")).toThrow("Unknown or unavailable");
    expect(() => providerBySlug("other")).toThrow("Unknown or unavailable");
    const url = outlook.authorizeUrl("state-1", "challenge-1");
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "test-client",
      response_type: "code",
      scope: OUTLOOK_SCOPES,
      state: "state-1",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
      prompt: "select_account",
      redirect_uri: `${origin}/api/mail/outlook/callback`,
    });
    expect(OUTLOOK_SCOPES).toBe("offline_access User.Read Mail.Read");
  });
  it.each([
    "User.Read Mail.Read",
    "offline_access User.Read Mail.Read openid profile email",
    "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access",
  ])("accepts required read-only scopes %s", (scope) => expect(readOnlyScopes(scope)).toBe(true));
  it.each([
    undefined,
    "",
    " ",
    "User.Read",
    "Mail.Read",
    "offline_access",
    "User.Read Mail.Read Mail.Send",
    "User.Read Mail.Read Mail.ReadWrite",
    "User.Read Mail.Read Calendars.Read",
    "User.Read Mail.Read https://evil.invalid/Mail.Read",
    "User.Read Mail.ReadBasic",
    "User.Read Mail.Read .default",
    "User.Read Mail.Read User.Read.All",
  ])(
    "rejects absent, insufficient or unexpected grants %s before account lookup",
    async (scope) => {
      expect(readOnlyScopes(scope)).toBe(false);
      const request = vi.fn().mockResolvedValue(Response.json({ access_token: "access", scope }));
      vi.stubGlobal("fetch", request);
      await expect(outlook.exchangeCode("code", "verifier")).rejects.toThrow("read-only mail");
      expect(request).toHaveBeenCalledTimes(1);
      const [url, init] = request.mock.calls[0];
      expect(url).toBe("https://login.microsoftonline.com/consumers/oauth2/v2.0/token");
      expect(Object.fromEntries(init.body)).toMatchObject({
        code_verifier: "verifier",
        grant_type: "authorization_code",
        redirect_uri: `${origin}/api/mail/outlook/callback`,
      });
      expect(init.redirect).toBe("error");
    },
  );
  it.each(["", "offline_access", "User.Read Mail.Read Mail.Send"])(
    "rejects invalid provided refresh scopes %s",
    async (scope) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ access_token: "a", scope })),
      );
      await expect(outlook.refreshTokens("r")).rejects.toThrow("read-only mail");
    },
  );
  it("accepts omitted refresh scopes and rotation", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ access_token: "a", refresh_token: "rotated", expires_in: 120 }),
      );
    vi.stubGlobal("fetch", request);
    expect(await outlook.refreshTokens("r")).toMatchObject({
      accessToken: "a",
      refreshToken: "rotated",
    });
    expect(Object.fromEntries(request.mock.calls[0][1].body)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "r",
      scope: OUTLOOK_SCOPES,
    });
  });
  it.each([
    [{ mail: null, userPrincipalName: "Person@Outlook.in" }, "person@outlook.in"],
    [{ mail: "Person@Outlook.COM", userPrincipalName: "Other@Outlook.in" }, "person@outlook.com"],
  ])("normalizes the account mail or UPN fallback", async (profile, email) => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: "a", refresh_token: "r", scope: "Mail.Read User.Read" }),
      )
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal("fetch", request);
    expect(await outlook.exchangeCode("code", "verifier")).toMatchObject({
      email,
      tokens: { accessToken: "a", refreshToken: "r" },
    });
    expect(new URL(request.mock.calls[1][0]).pathname).toBe("/v1.0/me");
    expect(new Headers(request.mock.calls[1][1].headers).get("Prefer")).toContain(
      'IdType="ImmutableId"',
    );
    expect(request.mock.calls[1][1].redirect).toBe("error");
  });
  it("reports missing configuration and invalid account/token values without echoing secrets", async () => {
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    expect(outlook.configuration()).toMatchObject({
      configured: false,
      missing: ["MICROSOFT_CLIENT_SECRET"],
    });
    await expect(outlook.refreshTokens("r")).rejects.toThrow("MICROSOFT_CLIENT_SECRET");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ access_token: 42, scope: "Mail.Read User.Read" })),
    );
    await expect(outlook.exchangeCode("c", "v")).rejects.toThrow("invalid token response");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ access_token: "a", scope: "Mail.Read User.Read" }))
        .mockResolvedValueOnce(Response.json({ mail: "not-an-email" })),
    );
    await expect(outlook.exchangeCode("c", "v")).rejects.toThrow("account email");
  });
});

it("keeps a mail with many To recipients within the import display limit", async () => {
  const addresses = Array.from({ length: 45 }, (_, i) => `candidate${i}@example.invalid`);
  vi.spyOn(outlook, "accessToken").mockResolvedValue("access");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        value: [
          message({ toRecipients: addresses.map((address) => ({ emailAddress: { address } })) }),
        ],
      }),
    ),
  );
  const page = await outlook.scanMail(connection, { until: "2026-10-30T00:00:00Z" }, []);
  expect(page.messages).toHaveLength(1);
  expect(page.messages[0]).toMatchObject({
    externalId: "AAMk-MovedID",
    recipient: addresses.join(", ").slice(0, 999) + "…",
  });
});

const search: SearchRequest = {
  since: "2026-10-01T00:00:00Z",
  until: "2026-10-31T00:00:00Z",
  identity: { names: ["Northstar"], keywords: [], senders: [], domains: ["example.invalid"] },
};
it("searchMail sends the built query and enforces the exact window", async () => {
  vi.spyOn(outlook, "accessToken").mockResolvedValue("access");
  const request = vi.fn().mockResolvedValue(
    Response.json({
      value: [
        message({ id: "inside", parentFolderId: "junk" }),
        message({ id: "draft", parentFolderId: "drafts", isDraft: true }),
        message({ id: "early", receivedDateTime: "2026-09-30T20:00:00Z", parentFolderId: "junk" }),
      ],
    }),
  );
  vi.stubGlobal("fetch", request);
  const folders = [
    { id: "junk", name: "Junk Email" },
    { id: "drafts", name: "Drafts", contextOnly: true },
  ];
  const page = await outlook.searchMail(connection, search, folders);
  const url = new URL(request.mock.calls[0][0]);
  expect(url.pathname).toBe("/v1.0/me/messages");
  expect(url.searchParams.get("$search")).toBe(outlookSearchQuery(search));
  expect(url.searchParams.get("$top")).toBe("25");
  expect(page.query).toBe(outlookSearchQuery(search));
  expect(page.messages.map((row) => row.externalId)).toEqual(["inside"]);
  expect(page.messages[0].folders).toEqual(["Junk Email"]);
});
it("Outlook fetchMessage returns null on 404", async () => {
  vi.spyOn(outlook, "accessToken").mockResolvedValue("access");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: { message: "missing" } }, { status: 404 })),
  );
  expect(await outlook.fetchMessage(connection, "gone", [])).toBeNull();
});
