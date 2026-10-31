import { recipientPreview } from "./display-metadata";
import { oauthConfiguration, parseTokenResponse } from "./oauth";
import { accessTokenFor } from "./connections";
import type { MailFolder, MailProvider, ScannedMessage, TokenSet } from "./types";
import { gmailSearchQuery, inWindow } from "./search-query";
import { plainText } from "./plain-text";
class GmailReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
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
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    let rateLimited = response.status === 429;
    if (response.status === 403) {
      try {
        const error = (await response.json()) as {
          error?: { errors?: { reason?: string }[] };
        };
        rateLimited =
          error.error?.errors?.some((row) =>
            ["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"].includes(
              row.reason ?? "",
            ),
          ) ?? false;
      } catch {
        /* Provider bodies never appear in logs or UI. */
      }
    }
    throw new GmailReadError(
      response.status === 401
        ? "Gmail authorization expired. Reconnect Gmail."
        : rateLimited
          ? "Gmail rate limit reached. Wait a few minutes and continue the check."
          : response.status >= 500
            ? "Gmail is temporarily unavailable. Retry to continue saved pages."
            : "Gmail could not be read. Check your Google API configuration and retry.",
      response.status,
    );
  }
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
  labelIds?: string[];
};
function textBody(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  return (part.parts ?? []).map(textBody).filter(Boolean).join("\n");
}
function htmlBody(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/html" && part.body?.data)
    return plainText(Buffer.from(part.body.data, "base64url").toString("utf8"));
  return (part.parts ?? []).map(htmlBody).filter(Boolean).join("\n");
}
/** A Gmail message in the shape every mail path stores. */
function toScanned(message: GmailMessage, folders: MailFolder[]): ScannedMessage {
  const header = (name: string) =>
    message.payload?.headers?.find((row) => row.name.toLowerCase() === name.toLowerCase())?.value ??
    "";
  const from = header("From");
  const address = from.match(/<([^>]+)>/);
  const labels = message.labelIds ?? [];
  const names = labels.map((id) => folders.find((folder) => folder.id === id)?.name ?? id);
  if (!labels.some((id) => ["INBOX", "SPAM", "TRASH", "SENT", "DRAFT"].includes(id)))
    names.push("Archive");
  return {
    externalId: message.id,
    internetMessageId: header("Message-ID"),
    threadId: message.threadId,
    sender: address?.[1] ?? from,
    senderName: address ? from.split("<")[0].trim().replace(/^"|"$/g, "") : "",
    recipient: recipientPreview(header("To")),
    subject: header("Subject") || "(No subject)",
    snippet: (message.snippet ?? "").slice(0, 2000),
    bodyText: (
      textBody(message.payload) ||
      htmlBody(message.payload) ||
      message.snippet ||
      ""
    ).slice(0, 100000),
    receivedAt: new Date(Number(message.internalDate)).toISOString(),
    folders: names,
    contextOnly: labels.some((id) => ["SENT", "DRAFT"].includes(id)),
  };
}
/** One full message, or null when Gmail no longer has it. */
async function readMessage(id: string, accessToken: string) {
  try {
    return await gmailRequest<GmailMessage>(
      `messages/${encodeURIComponent(id)}?format=full`,
      accessToken,
    );
  } catch (error) {
    if (error instanceof GmailReadError && [404, 410].includes(error.status)) return null;
    throw error;
  }
}
/** Full messages two at a time, skipping ones that disappeared since they were listed. */
async function readMessages(ids: string[], accessToken: string, folders: MailFolder[]) {
  const messages: ScannedMessage[] = [];
  for (let offset = 0; offset < ids.length; offset += 2) {
    const chunk = await Promise.all(
      ids.slice(offset, offset + 2).map((id) => readMessage(id, accessToken)),
    );
    for (const message of chunk) if (message) messages.push(toScanned(message, folders));
  }
  return messages;
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
  async folders(connection) {
    const accessToken = await gmail.accessToken(connection);
    const result = await gmailRequest<{
      labels: { id: string; name: string }[];
    }>("labels", accessToken);
    return result.labels.map((label) => ({
      ...label,
      contextOnly: ["SENT", "DRAFT"].includes(label.id),
    }));
  },
  async scanMail(connection, request, folders) {
    const accessToken = await gmail.accessToken(connection);
    const terms = [
      "-in:sent",
      "-in:drafts",
      `before:${Math.ceil(Date.parse(request.until) / 1000)}`,
    ];
    if (request.since) terms.push(`after:${Math.floor(Date.parse(request.since) / 1000)}`);
    const params = new URLSearchParams({
      q: terms.join(" "),
      maxResults: "25",
      includeSpamTrash: "true",
    });
    if (request.next) params.set("pageToken", request.next);
    const page = await gmailRequest<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(`messages?${params}`, accessToken);
    const listed = page.messages ?? [];
    const known = new Set(request.skipIds ?? []);
    const ids = listed.filter((row) => !known.has(row.id)).map((row) => row.id);
    const messages = await readMessages(ids, accessToken, folders);
    return {
      messages,
      next: page.nextPageToken,
      ...(request.skipIds
        ? { fetched: listed.length, skippedKnown: listed.length - ids.length }
        : {}),
    };
  },
  async searchMail(connection, request, folders) {
    const accessToken = await gmail.accessToken(connection);
    const query = gmailSearchQuery(request);
    const params = new URLSearchParams({ q: query, maxResults: "25", includeSpamTrash: "true" });
    if (request.next) params.set("pageToken", request.next);
    const page = await gmailRequest<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `messages?${params}`,
      accessToken,
    );
    const messages = await readMessages(
      (page.messages ?? []).map((row) => row.id),
      accessToken,
      folders,
    );
    return {
      messages: messages.filter((message) => inWindow(request, message)),
      next: page.nextPageToken,
      query,
    };
  },
  async fetchMessage(connection, providerMessageId, folders) {
    const message = await readMessage(providerMessageId, await gmail.accessToken(connection));
    return message ? toScanned(message, folders) : null;
  },
};
