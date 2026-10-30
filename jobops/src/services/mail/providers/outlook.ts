import { recipientPreview } from "./display-metadata";
import { classifyMail } from "../classifier";
import { accessTokenFor } from "./connections";
import { oauthConfiguration, parseTokenResponse } from "./oauth";
import type { MailProvider, TokenSet, MailFolder } from "./types";
import { outlookSearchQuery } from "./search-query";
import { plainText } from "./plain-text";

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
      value.startsWith(`${graphOrigin}/`)
        ? value.slice(graphOrigin.length + 1)
        : value,
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

async function token(
  body: Record<string, string>,
  refreshing: boolean,
): Promise<TokenSet> {
  const config = outlook.configuration();
  if (!config.configured)
    throw new Error(
      `Outlook is not configured. Set ${config.missing.join(", ")}.`,
    );
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
    throw new Error(
      "Microsoft returned an invalid token response. Reconnect Outlook.",
    );
  }
  const scope =
    data && typeof data === "object"
      ? (data as Record<string, unknown>).scope
      : undefined;
  if (
    !(refreshing && scope === undefined) &&
    !(typeof scope === "string" && readOnlyScopes(scope))
  )
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
    ![
      inboxPath,
      "/v1.0/me/mailfolders/inbox/messages",
      "/v1.0/me/mailFolders('inbox')/messages",
      "/v1.0/me/mailfolders('inbox')/messages",
    ].includes(url.pathname) ||
    url.username ||
    url.password ||
    next.includes("#")
  )
    throw new Error("Microsoft returned an unsafe mail paging URL.");
  // Preserve the provider's entire opaque query rather than rebuilding skip tokens.
  return next;
}

class OutlookReadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
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
    throw new OutlookReadError(
      response.status === 401
        ? "Outlook authorization expired. Reconnect Outlook."
        : response.status === 429
          ? "Outlook rate limit reached. Wait a few minutes and retry refresh."
          : response.status >= 500
            ? "Outlook is temporarily unavailable. Retry to continue saved pages."
            : "Outlook could not be read. Check your Microsoft Graph configuration and retry.",
      response.status,
    );
  return (await response.json()) as T;
}

/** A continuation may only return to the exact resource we requested. */
export function safeScanLink(next: string, resource: string) {
  const canonical = (path: string) =>
    path
      .replace(/mailfolders/gi, "mailFolders")
      .replace(/childfolders/gi, "childFolders")
      .replace(/mailFolders\('([^']+)'\)/g, "mailFolders/$1")
      .replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    throw new Error("Microsoft returned an invalid paging URL.");
  }
  if (
    url.origin !== graphOrigin ||
    url.username ||
    url.password ||
    next.includes("#") ||
    canonical(url.pathname) !== canonical(resource)
  )
    throw new Error("Microsoft returned an unsafe paging destination.");
  return next;
}

type GraphAddress = { emailAddress?: { name?: string; address?: string } };
type GraphMessage = {
  id: string;
  internetMessageId?: string | null;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  from?: GraphAddress;
  toRecipients?: GraphAddress[];
  receivedDateTime: string;
  parentFolderId?: string;
  isDraft?: boolean;
};

export const outlook: MailProvider = {
  id: "OUTLOOK",
  slug: "outlook",
  label: "Outlook",
  configuration: () =>
    oauthConfiguration("MICROSOFT", "/api/mail/outlook/callback"),
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
    const profile = await graphRequest<{
      mail?: string | null;
      userPrincipalName?: string;
    }>(
      `${graphOrigin}/v1.0/me?$select=mail,userPrincipalName`,
      tokens.accessToken,
    );
    const email = profile.mail || profile.userPrincipalName;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error(
        "Microsoft did not return an account email. Reconnect Outlook.",
      );
    return { email: email.toLowerCase(), tokens };
  },
  refreshTokens: (refreshToken) =>
    token({ grant_type: "refresh_token", refresh_token: refreshToken }, true),
  accessToken: accessTokenFor,
  async folders(connection) {
    const accessToken = await outlook.accessToken(connection);
    const contextIds = await Promise.all(
      ["sentitems", "drafts", "outbox"].map(async (name) => {
        const result = await graphRequest<{ id: string }>(
          `${graphOrigin}/v1.0/me/mailFolders/${name}?$select=id`,
          accessToken,
        );
        return result.id;
      }),
    );
    const queue = [
      { path: "/v1.0/me/mailFolders", prefix: "", contextOnly: false },
    ];
    const found: MailFolder[] = [];
    const visited = new Set<string>();
    let pages = 0;
    while (queue.length) {
      const resource = queue.shift()!;
      let next: string | undefined =
        `${graphOrigin}${resource.path}?includeHiddenFolders=true&$top=100&$select=id,displayName,childFolderCount`;
      while (next) {
        if (++pages > 1000)
          throw new Error(
            "Folder inventory is too large for one check. No scan checkpoint was advanced.",
          );
        const result: {
          value: {
            id: string;
            displayName: string;
            childFolderCount: number;
          }[];
          "@odata.nextLink"?: string;
        } = await graphRequest(next, accessToken);
        for (const folder of result.value) {
          if (visited.has(folder.id)) continue;
          visited.add(folder.id);
          const name = resource.prefix + folder.displayName;
          const contextOnly =
            resource.contextOnly || contextIds.includes(folder.id);
          found.push({ id: folder.id, name, contextOnly });
          if (folder.childFolderCount > 0)
            queue.push({
              path: `/v1.0/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders`,
              prefix: `${name} / `,
              contextOnly,
            });
        }
        next = result["@odata.nextLink"]
          ? safeScanLink(result["@odata.nextLink"], resource.path)
          : undefined;
      }
    }
    return found;
  },
  async scanMail(connection, request, folders) {
    const resource = "/v1.0/me/messages";
    const filters = [
      `receivedDateTime le ${new Date(request.until).toISOString()}`,
    ];
    if (request.since)
      filters.unshift(
        `receivedDateTime ge ${new Date(request.since).toISOString()}`,
      );
    const query = new URLSearchParams({
      $top: "50",
      $filter: filters.join(" and "),
      $orderby: "receivedDateTime desc",
      $select:
        "id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,parentFolderId,isDraft",
    });
    if (request.skipIds) query.set("$select", query.get("$select")!.split(",").filter((field) => field !== "body").join(","));
    const search = outlookSearchQuery(request);
    if (search) {
      query.delete("$filter");
      query.delete("$orderby");
      query.set("$search", search);
    }
    const url = request.next
      ? safeScanLink(request.next, resource)
      : `${graphOrigin}${resource}?${query}`;
    const accessToken = await outlook.accessToken(connection);
    const page = await graphRequest<{
      value: GraphMessage[];
      "@odata.nextLink"?: string;
    }>(url, accessToken);
    const next = page["@odata.nextLink"]
      ? safeScanLink(page["@odata.nextLink"], resource)
      : undefined;
    const unavailable = new Set<string>();
    if (request.skipIds) {
      const known = new Set(request.skipIds);
      const internetIds = new Set(request.skipInternetIds ?? []);
      const unread = page.value.filter((message) => {
        const folder = folders.find((row) => row.id === message.parentFolderId);
        const received = Date.parse(message.receivedDateTime);
        return !known.has(message.id) && !(message.internetMessageId && internetIds.has(message.internetMessageId)) &&
          !message.isDraft && !folder?.contextOnly && received < Date.parse(request.until) &&
          (!request.since || received >= Date.parse(request.since));
      });
      for (let offset = 0; offset < unread.length; offset += 2) {
        await Promise.all(unread.slice(offset, offset + 2).map(async (message) => {
          try {
            const detail = await graphRequest<{ body?: GraphMessage["body"] }>(
              `${graphOrigin}${resource}/${encodeURIComponent(message.id)}?$select=body`, accessToken);
            message.body = detail.body;
          } catch (error) {
            if (error instanceof OutlookReadError && [404, 410].includes(error.status)) unavailable.add(message.id);
            else throw error;
          }
        }));
      }
    }
    const messages = page.value.filter((message) => !unavailable.has(message.id)).map((message) => {
      const folder = folders.find((row) => row.id === message.parentFolderId);
      if (!folder && message.parentFolderId)
        throw new Error(
          "A message folder is missing from the inventory. Refresh folder coverage and retry.",
        );
      return {
        externalId: message.id,
        internetMessageId: message.internetMessageId?.trim() || undefined,
        threadId: message.conversationId,
        sender:
          message.from?.emailAddress?.address ?? "unknown@outlook.invalid",
        senderName: message.from?.emailAddress?.name ?? "",
        recipient: recipientPreview(
          (message.toRecipients ?? [])
            .map((row) => row.emailAddress?.address ?? "")
            .join(", "),
        ),
        subject: message.subject || "(No subject)",
        snippet: (message.bodyPreview ?? "").slice(0, 2000),
        bodyText: (message.body?.contentType?.toLowerCase() === "html"
          ? plainText(message.body.content ?? "")
          : (message.body?.content ?? "")
        ).slice(0, 100000),
        receivedAt: new Date(message.receivedDateTime).toISOString(),
        folders: [folder?.name ?? "Mailbox"],
        contextOnly: message.isDraft || folder?.contextOnly,
      };
    });
    return { messages, next, ...(request.skipIds ? { fetched: page.value.length, skippedUnavailable: unavailable.size } : {}) };
  },
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
    const page = await graphRequest<{
      value: GraphMessage[];
      "@odata.nextLink"?: string;
    }>(url, accessToken);
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
        sender:
          message.from?.emailAddress?.address ?? "unknown@outlook.invalid",
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
