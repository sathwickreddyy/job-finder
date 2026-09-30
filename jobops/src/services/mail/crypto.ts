import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function encryptionKey() {
  const value = process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw new Error(
      "Configure GMAIL_TOKEN_ENCRYPTION_KEY with a base64-encoded 32-byte key before connecting Gmail.",
    );
  return key;
}
export function validEncryptionKey() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
export function encryptToken(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    nonce.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}
export function decryptToken(value: string) {
  const [version, nonce, tag, ciphertext] = value.split(":");
  if (version !== "v1" || !nonce || !tag || !ciphertext)
    throw new Error("Gmail token storage is invalid. Reconnect Gmail.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "The Gmail connection could not be decrypted. Restore the original encryption key or reconnect Gmail.",
    );
  }
}
