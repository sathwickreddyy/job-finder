import { afterEach, expect, it, vi } from "vitest";
import { oauthConfiguration } from "./oauth";
afterEach(() => vi.unstubAllEnvs());
it("requires an exact trusted callback and accepts the legacy encryption key", () => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
  vi.stubEnv("GOOGLE_CLIENT_ID", "id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", "");
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:3210/api/mail/gmail/callback");
  expect(oauthConfiguration("GOOGLE", "/api/mail/gmail/callback").configured).toBe(true);
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:3210/api/mail/outlook/callback");
  expect(oauthConfiguration("GOOGLE", "/api/mail/gmail/callback").configured).toBe(false);
});
it.each([
  "http://example.com",
  "ftp://127.0.0.1",
  "https://user:pass@example.com",
  "https://example.com/path",
  "https://example.com?next=x",
])("rejects unsafe APP_URL %s", (origin) => {
  vi.stubEnv("APP_URL", origin);
  expect(oauthConfiguration("GOOGLE", "/api/mail/gmail/callback").missing).toContain("APP_URL");
});
it.each(["https://example.com", "http://localhost:3210", "http://[::1]:3210"])(
  "accepts exact safe callback on %s",
  (origin) => {
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    vi.stubEnv("GOOGLE_REDIRECT_URI", `${origin}/api/mail/gmail/callback`);
    expect(oauthConfiguration("GOOGLE", "/api/mail/gmail/callback").configured).toBe(true);
    vi.stubEnv("GOOGLE_REDIRECT_URI", `${origin}/api/mail/gmail/callback?extra=1`);
    expect(oauthConfiguration("GOOGLE", "/api/mail/gmail/callback").configured).toBe(false);
  },
);
