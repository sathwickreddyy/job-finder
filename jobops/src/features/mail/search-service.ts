import { z } from "zod";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { encryptToken, decryptToken } from "@/services/mail/crypto";
import { providerFor } from "@/services/mail/providers";
import { withConnectionLock } from "@/services/mail/providers/connections";
import { classifyMail } from "@/services/mail/classifier";
import { currentMessageText } from "@/services/mail/providers/plain-text";
import { gmailSearchQuery, outlookSearchQuery } from "@/services/mail/providers/search-query";
import type { MailConnection, ScannedMessage } from "@/services/mail/providers/types";
import { mailSearchRequestSchema, mailSearchSchema, resolveMailSearch } from "./search-contract";

const accountState = z.object({
  id: z.uuid(),
  next: z.string().optional(),
  fetched: z.number().int().nonnegative(),
  complete: z.boolean(),
  limited: z.boolean(),
});
const cursorSchema = z.object({
  purpose: z.literal("mail-search-v1"),
  expires: z.number(),
  query: mailSearchSchema,
  accounts: z.array(accountState).min(1).max(10),
});
export class MailSearchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
type SearchPage = { messages: ScannedMessage[]; next?: string };
type Dependencies = {
  connections(): Promise<MailConnection[]>;
  page(
    connection: MailConnection,
    request: Parameters<ReturnType<typeof providerFor>["scanMail"]>[1],
  ): Promise<SearchPage>;
};
const defaults: Dependencies = {
  connections: () => db.select().from(mailConnections),
  page: (connection, request) =>
    withConnectionLock(connection.id, async (_db, current) => {
      const provider = providerFor(current.provider);
      return provider.scanMail(current, request, await provider.folders(current));
    }),
};

/** One page per account, concurrently. No classification-based rejection or writes. */
export async function searchMail(input: unknown, dependencies: Dependencies = defaults) {
  const parsed = mailSearchRequestSchema.parse(input);
  let state: z.infer<typeof cursorSchema>;
  const connections = await dependencies.connections();
  if ("cursor" in parsed) {
    try {
      state = cursorSchema.parse(JSON.parse(decryptToken(parsed.cursor)));
    } catch {
      throw new MailSearchError("Invalid search cursor. Start a new search.");
    }
    if (state.expires <= Date.now())
      throw new MailSearchError("Search cursor expired. Start a new search.");
  } else {
    const query = mailSearchSchema.parse(resolveMailSearch(parsed));
    const selected = connections.filter(
      (c) => !query.accounts || query.accounts.includes(c.email.toLowerCase()),
    );
    if (query.accounts?.some((email) => !selected.some((c) => c.email.toLowerCase() === email)))
      throw new MailSearchError("A requested account is not connected.");
    if (!selected.length) throw new MailSearchError("Connect an account before searching mail.");
    if (selected.length > 10) throw new MailSearchError("Select at most 10 accounts per search.");
    state = {
      purpose: "mail-search-v1",
      expires: Date.now() + 86400000,
      query,
      accounts: selected.map((c) => ({ id: c.id, fetched: 0, complete: false, limited: false })),
    };
  }
  const query = resolveMailSearch(state.query);
  const accounts = await Promise.all(
    state.accounts.map(async (saved) => {
      const connection = connections.find((c) => c.id === saved.id);
      const base = {
        accountId: saved.id,
        account: connection?.email ?? null,
        provider: connection?.provider ?? null,
        fetched: 0,
        returned: 0,
        skippedContext: 0,
        skippedOutsideWindow: 0,
        messages: [] as ReturnType<typeof resultMessage>[],
        error: null as string | null,
        complete: saved.complete,
        limited: saved.limited,
        totalFetched: saved.fetched,
        effectiveQuery: null as string | null,
      };
      if (saved.complete || saved.limited) return base;
      if (!connection)
        return { ...base, error: "Account disconnected. Reconnect or start a new search." };
      const request = { since: query.since, until: query.until, next: saved.next, search: query };
      const providerQuery =
        connection.provider === "GMAIL" ? gmailSearchQuery(request) : outlookSearchQuery(request);
      base.effectiveQuery =
        providerQuery ??
        `receivedDateTime >= ${query.since ?? "all dates"}; receivedDateTime < ${query.until}`;
      try {
        const page = await dependencies.page(connection, request);
        const messages: typeof base.messages = [];
        for (const message of page.messages) {
          if (message.contextOnly) {
            base.skippedContext++;
            continue;
          }
          const received = Date.parse(message.receivedAt);
          if (
            !Number.isFinite(received) ||
            received >= Date.parse(query.until) ||
            (query.since && received < Date.parse(query.since))
          ) {
            base.skippedOutsideWindow++;
            continue;
          }
          messages.push(resultMessage(message, connection));
        }
        saved.fetched += page.messages.length;
        // Graph $search has a 1,000-result ceiling, even if nextLink disappears.
        // Never report exhaustive coverage when that ceiling could have been hit.
        saved.limited =
          connection.provider === "OUTLOOK" && Boolean(providerQuery) && saved.fetched >= 1000;
        saved.complete = !page.next && !saved.limited;
        saved.next = page.next;
        return {
          ...base,
          fetched: page.messages.length,
          returned: messages.length,
          messages,
          totalFetched: saved.fetched,
          complete: saved.complete,
          limited: saved.limited,
        };
      } catch {
        // Arbitrary fetch/DB errors can include tokens, message bodies or SQL. Do not serialize them.
        return {
          ...base,
          error: "Account search failed. Retry this cursor; check the connection if it persists.",
        };
      }
    }),
  );
  const more = state.accounts.some((c) => !c.complete && !c.limited);
  return {
    query,
    readOnly: true,
    window: {
      since: query.since ?? null,
      until: query.until,
      bounds: "since inclusive; until exclusive",
    },
    scope:
      "Incoming mail across provider-accessible folders including spam/trash; excludes sent/drafts/outbox and separate online archives",
    accounts,
    complete: state.accounts.every((c) => c.complete),
    more,
    limited: state.accounts.some((c) => c.limited),
    nextCursor: more ? encryptToken(JSON.stringify(state)) : null,
    warning: state.accounts.some((c) => c.limited)
      ? "Outlook search reached its 1,000-result ceiling. Narrow the date range; coverage is incomplete."
      : null,
  };
}

function resultMessage(message: ScannedMessage, connection: MailConnection) {
  return {
    ...message,
    account: connection.email,
    provider: connection.provider,
    identity: `${connection.id}:${message.externalId}`,
    classification: classifyMail({
      ...message,
      bodyText: currentMessageText(message.bodyText ?? ""),
    }),
  };
}
