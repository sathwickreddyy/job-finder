import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
export const accessCookie = "jobops_access";
export function credentialDigest(token: string) {
  return createHash("sha256").update(`jobops-access:${token}`).digest("hex");
}
export function equalCredential(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname.toLowerCase());
}
// This classifies target hostnames, not client IPs. The firewall is the LAN boundary.
export function isLocalNetworkHost(hostname: string) {
  if (isLoopback(hostname)) return true;
  const address = hostname.replace(/^\[|\]$/g, "");
  if (isIP(address) === 4) {
    const [first, second] = address.split(".").map(Number);
    return (
      first === 127 ||
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (isIP(address) === 6) {
    const first = Number.parseInt(address.split(":")[0], 16);
    return (first >= 0xfc00 && first <= 0xfdff) || (first >= 0xfe80 && first <= 0xfebf);
  }
  return false;
}
export function configuredOrigin() {
  return new URL(process.env.APP_URL ?? "http://127.0.0.1:3210").origin;
}
export function safeOrigin(origin: string | null, expected = configuredOrigin()) {
  if (!origin) return false;
  try {
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}
