import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "./crypto";
afterEach(() => vi.unstubAllEnvs());
describe("Gmail token encryption", () => {
  it("round-trips with unique nonces and rejects tampering", () => {
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    const token = encryptToken("secret-token");
    expect(decryptToken(token)).toBe("secret-token");
    expect(encryptToken("secret-token")).not.toBe(token);
    const parts = token.split(":");
    parts[3] = Buffer.from("changed").toString("base64");
    expect(() => decryptToken(parts.join(":"))).toThrow("could not be decrypted");
  });
  it("rejects missing keys", () => {
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", "");
    expect(() => encryptToken("secret")).toThrow("32-byte");
  });
});
it("decrypts the exact legacy ciphertext after switching key names", () => {
  const key = Buffer.alloc(32, 3).toString("base64");
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", "");
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", key);
  const legacy = encryptToken("existing-refresh-token");
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", key);
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", "");
  expect(decryptToken(legacy)).toBe("existing-refresh-token");
});
