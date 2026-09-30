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
