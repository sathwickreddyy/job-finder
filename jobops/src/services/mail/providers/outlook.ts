import { recipientPreview } from "./display-metadata";
import { classifyMail } from "../classifier";
import { accessTokenFor } from "./connections";
import { oauthConfiguration, parseTokenResponse } from "./oauth";
import type { MailProvider, TokenSet } from "./types";

export const OUTLOOK_SCOPES = "offline_access User.Read Mail.Read";
const authority = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const graphOrigin = "https://graph.microsoft.com";
const inboxPath = "/v1.0/me/mailFolders/inbox/messages";
const preference = 'outlook.body-content-type="text", IdType="ImmutableId"';

export function readOnlyScopes(scope?: string): boolean {
  if (!scope?.trim()) return false;
  const grants = scope
    .trim()
    .split(/\s+/)
    .map((value) =>
      value.startsWith(`${graphOrigin}/`) ? value.slice(graphOrigin.length + 1) : value,
    );
  const allowed = new Set([
    "offline_access",
    "User.Read",
    "Mail.Read",
    "openid",
    "profile",
    "email",
  ]);
  return (
    grants.includes("User.Read") &&
    grants.includes("Mail.Read") &&
    grants.every((value) => allowed.has(value))
  );
}

async function token(body: Record<string, string>, refreshing: boolean): Promise<TokenSet> {
  const config = outlook.configuration();
  if (!config.configured)
    throw new Error(`Outlook is not configured. Set ${config.missing.join(", ")}.`);
  const response = await fetch(`${authority}/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: OUTLOOK_SCOPES,
      ...body,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      refreshing
        ? "Microsoft could not renew Outlook read-only access. Reconnect Outlook."
        : "Microsoft could not connect this account. Verify the redirect URI and reconnect Outlook.",
    );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Microsoft returned an invalid token response. Reconnect Outlook.");
  }
  const scope =
    data && typeof data === "object" ? (data as Record<string, unknown>).scope : undefined;
  if (!(refreshing && scope === undefined) && !(typeof scope === "string" && readOnlyScopes(scope)))
    throw new Error(
      "Microsoft returned missing read permissions or permissions beyond read-only mail. Revoke this app and reconnect Outlook with User.Read and Mail.Read.",
    );
  return parseTokenResponse(data);
}

function safeNextLink(next: string): string {
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    throw new Error("Microsoft returned an invalid mail paging URL.");
  }
  if (
    url.origin !== graphOrigin ||
    (url.pathname !== inboxPath && url.pathname !== "/v1.0/me/mailfolders/inbox/messages") ||
    url.username ||
    url.password ||
    next.includes("#")
  )
    throw new Error("Microsoft returned an unsafe mail paging URL.");
  // Preserve the provider's entire opaque query rather than rebuilding skip tokens.
  return next;
}

async function graphRequest<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: preference },
    cache: "no-store",
    // Never forward a bearer token through a redirect, including same-origin redirects.
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Outlook authorization expired. Reconnect Outlook."
        : response.status === 429
          ? "Outlook rate limit reached. Wait a few minutes and retry refresh."
          : "Outlook could not be read. Check your Microsoft Graph configuration and retry.",
    );
  return (await response.json()) as T;
}

type GraphAddress = { emailAddress?: { name?: string; address?: string } };
type GraphMessage = {
  id: string;
  internetMessageId?: string | null;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  from?: GraphAddress;
  toRecipients?: GraphAddress[];
  receivedDateTime: string;
};

export const outlook: MailProvider = {
  id: "OUTLOOK",
  slug: "outlook",
  label: "Outlook",
  configuration: () => oauthConfiguration("MICROSOFT", "/api/mail/outlook/callback"),
  authorizeUrl(state, challenge) {
    const config = outlook.configuration();
    const url = new URL(`${authority}/authorize`);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: OUTLOOK_SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return url;
  },
  async exchangeCode(code, verifier) {
    const tokens = await token(
      {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: outlook.configuration().redirectUri,
      },
      false,
    );
    const profile = await graphRequest<{ mail?: string | null; userPrincipalName?: string }>(
      `${graphOrigin}/v1.0/me?$select=mail,userPrincipalName`,
      tokens.accessToken,
    );
    const email = profile.mail || profile.userPrincipalName;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Microsoft did not return an account email. Reconnect Outlook.");
    return { email: email.toLowerCase(), tokens };
  },
  refreshTokens: (refreshToken) =>
    token({ grant_type: "refresh_token", refresh_token: refreshToken }, true),
  accessToken: accessTokenFor,
  async listRecruitingMail(connection, cursor) {
    // Validate continuation before obtaining or sending any credentials.
    let url = cursor?.next ? safeNextLink(cursor.next) : undefined;
    if (!url) {
      const since = new Date(
        connection.lastSyncedAt
          ? connection.lastSyncedAt.getTime() - 86400000
          : Date.now() - 30 * 86400000,
      ).toISOString();
      const query = new URLSearchParams({
        $top: "50",
        $filter: `receivedDateTime ge ${since}`,
        $orderby: "receivedDateTime desc",
        $select:
          "id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime",
      });
      url = `${graphOrigin}${inboxPath}?${query}`;
    }
    const accessToken = await outlook.accessToken(connection);
    const page = await graphRequest<{ value: GraphMessage[]; "@odata.nextLink"?: string }>(
      url,
      accessToken,
    );
    const next = page["@odata.nextLink"];
    const nextCursor = next ? { next: safeNextLink(next) } : undefined;
    const messages = [];
    for (const message of page.value) {
      const subject = message.subject || "(No subject)";
      const bodyText = (message.body?.content ?? "").slice(0, 100000);
      const snippet = (message.bodyPreview ?? "").slice(0, 2000);
      if (!classifyMail({ subject, bodyText, snippet }).relevant) continue;
      messages.push({
        // Immutable Graph IDs preserve case; never use an unrequested mutable fallback.
        externalId: message.internetMessageId?.trim() || message.id,
        threadId: message.conversationId,
        sender: message.from?.emailAddress?.address ?? "unknown@outlook.invalid",
        senderName: message.from?.emailAddress?.name ?? "",
        recipient: recipientPreview(
          (message.toRecipients ?? [])
            .map((entry) => entry.emailAddress?.address ?? "")
            .filter(Boolean)
            .join(", "),
        ),
        subject,
        snippet,
        bodyText,
        receivedAt: new Date(message.receivedDateTime).toISOString(),
      });
    }
    return { messages, nextCursor };
  },
};
