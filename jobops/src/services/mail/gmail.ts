import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gmailConnections } from "@/db/schema";
import { decryptToken, encryptToken, validEncryptionKey } from "./crypto";
import { classifyMail } from "./classifier";
import { isLoopback } from "@/lib/security";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export function gmailConfiguration() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "";
  let safeRedirect = false;
  try {
    const callback = new URL(redirectUri);
    const app = new URL(process.env.APP_URL ?? "http://127.0.0.1:3210");
    safeRedirect =
      callback.origin === app.origin &&
      callback.pathname === "/api/gmail/callback" &&
      !callback.search &&
      !callback.hash &&
      !callback.username &&
      !callback.password &&
      (callback.protocol === "https:" ||
        (callback.protocol === "http:" && isLoopback(callback.hostname)));
  } catch {
    /* Missing configuration is an expected import-only mode. */
  }
  return {
    configured: Boolean(clientId && clientSecret && safeRedirect && validEncryptionKey()),
    clientId,
    clientSecret,
    redirectUri,
  };
}
type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};
function readonlyScope(scope?: string) {
  return Boolean(scope && scope.split(" ").every((value) => value === GMAIL_READONLY_SCOPE));
}
export async function exchangeGoogleCode(code: string, verifier: string) {
  const config = gmailConfiguration();
  if (!config.configured)
    throw new Error(
      "Gmail configuration is incomplete. Use JSON import or configure Google OAuth credentials and the token encryption key.",
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      "Google could not connect this account. Verify the redirect URI and try Connect Gmail again.",
    );
  const token = (await response.json()) as TokenResponse;
  if (!token.access_token || !readonlyScope(token.scope))
    throw new Error(
      "Google returned permissions other than gmail.readonly. Revoke this app in your Google account and reconnect with read-only consent.",
    );
  const profile = await gmailRequest<{ emailAddress: string }>("profile", token.access_token);
  if (!profile.emailAddress)
    throw new Error("Google did not return an account email. Reconnect Gmail.");
  const [existing] = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.email, profile.emailAddress));
  const values = {
    email: profile.emailAddress,
    encryptedAccessToken: encryptToken(token.access_token),
    encryptedRefreshToken: token.refresh_token
      ? encryptToken(token.refresh_token)
      : (existing?.encryptedRefreshToken ?? null),
    tokenExpiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
    updatedAt: new Date(),
  };
  await db
    .insert(gmailConnections)
    .values(values)
    .onConflictDoUpdate({ target: gmailConnections.email, set: values });
  return profile.emailAddress;
}
async function gmailRequest<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Gmail authorization expired. Reconnect Gmail."
        : response.status === 429
          ? "Gmail rate limit reached. Wait a few minutes and retry sync."
          : "Gmail could not be read. Check your Google API configuration and retry.",
    );
  return (await response.json()) as T;
}
async function connectionToken(connection: typeof gmailConnections.$inferSelect) {
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + 60000)
    return decryptToken(connection.encryptedAccessToken);
  if (!connection.encryptedRefreshToken)
    throw new Error(
      "This Gmail connection has no refresh token. Reconnect Gmail with read-only consent.",
    );
  const config = gmailConfiguration();
  if (!config.configured)
    throw new Error(
      "Restore Google OAuth credentials and the original encryption key before syncing Gmail.",
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: decryptToken(connection.encryptedRefreshToken),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Google could not renew Gmail read-only access. Reconnect Gmail.");
  const token = (await response.json()) as TokenResponse;
  if (!token.access_token || (token.scope && !readonlyScope(token.scope)))
    throw new Error(
      "Google returned unexpected permissions. Revoke this app and reconnect read-only.",
    );
  await db
    .update(gmailConnections)
    .set({
      encryptedAccessToken: encryptToken(token.access_token),
      tokenExpiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
      updatedAt: new Date(),
    })
    .where(eq(gmailConnections.id, connection.id));
  return token.access_token;
}
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};
function textBody(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  return (part.parts ?? []).map(textBody).filter(Boolean).join("\n");
}
export async function readRecruitingMail(
  connection: typeof gmailConnections.$inferSelect,
  cursor?: { pageToken?: string; query?: string },
) {
  const token = await connectionToken(connection);
  const since = connection.lastSyncedAt
    ? Math.floor((connection.lastSyncedAt.getTime() - 86400000) / 1000)
    : Math.floor((Date.now() - 30 * 86400000) / 1000);
  const query =
    cursor?.query ??
    `after:${since} -in:sent -in:drafts {application interview assessment recruiter recruiting "job offer" "career opportunity" "thank you for applying"}`;
  const params = new URLSearchParams({ q: query, maxResults: "100" });
  if (cursor?.pageToken) params.set("pageToken", cursor.pageToken);
  const response = await gmailRequest<{ messages?: { id: string }[]; nextPageToken?: string }>(
    `messages?${params}`,
    token,
  );
  const results = [];
  const ids = response.messages ?? [];
  for (let index = 0; index < ids.length; index += 5) {
    const chunk = await Promise.all(
      ids
        .slice(index, index + 5)
        .map((message) =>
          gmailRequest<GmailMessage>(
            `messages/${encodeURIComponent(message.id)}?format=full`,
            token,
          ),
        ),
    );
    for (const message of chunk) {
      const header = (name: string) =>
        message.payload?.headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
          ?.value ?? "";
      const subject = header("Subject") || "(No subject)";
      const bodyText = textBody(message.payload).slice(0, 100000);
      const classification = classifyMail({ subject, bodyText, snippet: message.snippet });
      if (!classification.relevant) continue;
      const from = header("From");
      const address = from.match(/<([^>]+)>/);
      results.push({
        externalId: message.id,
        threadId: message.threadId,
        provider: "GMAIL",
        sender: address?.[1] ?? from,
        senderName: address ? from.split("<")[0].trim().replace(/^"|"$/g, "") : "",
        recipient: header("To"),
        subject,
        snippet: message.snippet ?? "",
        bodyText,
        receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
      });
    }
  }
  return { messages: results, nextPageToken: response.nextPageToken, query };
}
