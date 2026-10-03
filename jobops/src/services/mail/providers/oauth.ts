import type { TokenSet } from "./types";
import { isLoopback } from "@/lib/security";
import { validEncryptionKey } from "../crypto";

/** No request-derived origin: OAuth cookies and returns use this configured origin. */
export function trustedAppUrl() {
  const app = new URL(process.env.APP_URL ?? "http://127.0.0.1:3210");
  if (
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== "/" ||
    !(app.protocol === "https:" || (app.protocol === "http:" && isLoopback(app.hostname)))
  )
    throw new Error("APP_URL must be an HTTPS origin or an HTTP loopback origin.");
  return app;
}
export function oauthConfiguration(prefix: "GOOGLE" | "MICROSOFT", callbackPath: string) {
  const clientId = process.env[`${prefix}_CLIENT_ID`] ?? "";
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`] ?? "";
  const redirectUri = process.env[`${prefix}_REDIRECT_URI`] ?? "";
  let safeRedirect = false;
  let safeApp = false;
  try {
    const app = trustedAppUrl();
    safeApp = true;
    const callback = new URL(redirectUri);
    safeRedirect =
      callback.origin === app.origin &&
      callback.pathname === callbackPath &&
      !callback.search &&
      !callback.hash &&
      !callback.username &&
      !callback.password;
  } catch {
    /* Configuration errors remain import-only mode. */
  }
  const missing = [
    ...(safeApp ? [] : ["APP_URL"]),
    ...(clientId.trim() ? [] : [`${prefix}_CLIENT_ID`]),
    ...(clientSecret.trim() ? [] : [`${prefix}_CLIENT_SECRET`]),
    ...(safeRedirect ? [] : [`${prefix}_REDIRECT_URI`]),
    ...(validEncryptionKey() ? [] : ["MAIL_TOKEN_ENCRYPTION_KEY"]),
  ];
  return { configured: !missing.length, missing, clientId, clientSecret, redirectUri };
}

/** Parse only expected fields; provider responses are never echoed into errors. */
export function parseTokenResponse(data: unknown): TokenSet {
  if (!data || typeof data !== "object")
    throw new Error("The provider returned an invalid token response. Reconnect the inbox.");
  const row = data as Record<string, unknown>;
  if (
    typeof row.access_token !== "string" ||
    !row.access_token.trim() ||
    /[\r\n]/.test(row.access_token) ||
    (row.refresh_token !== undefined &&
      (typeof row.refresh_token !== "string" || !row.refresh_token.trim())) ||
    (row.expires_in !== undefined &&
      (typeof row.expires_in !== "number" ||
        !Number.isFinite(row.expires_in) ||
        row.expires_in <= 0 ||
        row.expires_in > 31536000)) ||
    (row.token_type !== undefined &&
      (typeof row.token_type !== "string" || row.token_type.toLowerCase() !== "bearer"))
  )
    throw new Error("The provider returned an invalid token response. Reconnect the inbox.");
  return {
    accessToken: row.access_token,
    refreshToken: (row.refresh_token as string | undefined) ?? null,
    expiresAt: new Date(Date.now() + ((row.expires_in as number | undefined) ?? 3600) * 1000),
  };
}
