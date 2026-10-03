import { classifyMail } from "../classifier";
import { recipientPreview } from "./display-metadata";
import { oauthConfiguration, parseTokenResponse } from "./oauth";
import { accessTokenFor } from "./connections";
import type { MailProvider, TokenSet } from "./types";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
async function token(body: Record<string, string>, refreshing: boolean): Promise<TokenSet> {
  const config = gmail.configuration();
  if (!config.configured)
    throw new Error(`Gmail is not configured. Set ${config.missing.join(", ")}.`);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      refreshing
        ? "Google could not renew Gmail read-only access. Reconnect Gmail."
        : "Google could not connect this account. Verify the redirect URI and reconnect Gmail.",
    );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Google returned an invalid token response. Reconnect Gmail.");
  }
  const scope =
    data && typeof data === "object" ? (data as Record<string, unknown>).scope : undefined;
  if (
    !(refreshing && scope === undefined) &&
    !(
      typeof scope === "string" &&
      scope.trim() &&
      scope
        .trim()
        .split(/\s+/)
        .every((value) => value === GMAIL_READONLY_SCOPE)
    )
  )
    throw new Error(
      "Google returned permissions other than gmail.readonly. Revoke this app in your Google account and reconnect with read-only consent.",
    );
  return parseTokenResponse(data);
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
export const gmail: MailProvider = {
  id: "GMAIL",
  slug: "gmail",
  label: "Gmail",
  configuration: () => oauthConfiguration("GOOGLE", "/api/mail/gmail/callback"),
  authorizeUrl(state, challenge) {
    const config = gmail.configuration();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: GMAIL_READONLY_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      include_granted_scopes: "false",
    }).toString();
    return url;
  },
  async exchangeCode(code, verifier) {
    const tokens = await token(
      {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: gmail.configuration().redirectUri,
      },
      false,
    );
    const profile = await gmailRequest<{ emailAddress?: unknown }>("profile", tokens.accessToken);
    if (
      typeof profile.emailAddress !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.emailAddress)
    )
      throw new Error("Google did not return an account email. Reconnect Gmail.");
    return { email: profile.emailAddress.toLowerCase(), tokens };
  },
  refreshTokens: (refreshToken) =>
    token({ grant_type: "refresh_token", refresh_token: refreshToken }, true),
  accessToken: accessTokenFor,
  async listRecruitingMail(connection, cursor) {
    const token = await gmail.accessToken(connection);
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
          recipient: recipientPreview(header("To")),
          subject,
          snippet: message.snippet ?? "",
          bodyText,
          receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
        });
      }
    }
    return {
      messages: results,
      nextCursor: response.nextPageToken ? { pageToken: response.nextPageToken, query } : undefined,
    };
  },
};
