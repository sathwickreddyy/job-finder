import { mailSearchRequestSchema, resolveMailSearch } from "./search-contract";
import type { SearchAccount, SearchResponse } from "./search-state";
import { gmailSearchQuery, outlookSearchQuery } from "@/services/mail/providers/search-query";
import { classifyMail } from "@/services/mail/classifier";
export const previewAccounts: SearchAccount[] = [
  { id: "00000000-0000-4000-8000-000000000001", email: "demo@gmail.example", provider: "GMAIL" },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "demo@outlook.example",
    provider: "OUTLOOK",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "second@outlook.example",
    provider: "OUTLOOK",
  },
];
/** Gallery-only fixture transport. Never called by the live search page. */
export async function demoMailSearch(input: unknown): Promise<SearchResponse> {
  const parsed = mailSearchRequestSchema.parse(input);
  const continuing = "cursor" in parsed;
  const query = continuing
    ? JSON.parse(decodeURIComponent(parsed.cursor.slice(5)))
    : resolveMailSearch(parsed);
  const account = previewAccounts.find((a) => a.email === query.accounts?.[0])!;
  await new Promise((resolve) => setTimeout(resolve, account.provider === "GMAIL" ? 350 : 600));
  const subject =
    account.provider === "GMAIL"
      ? continuing
        ? "Amazon application status update"
        : "Amazon interview invitation"
      : "Amazon recruiter: career opportunity";
  const bodyText = continuing
    ? "An application update for your review."
    : account.provider === "GMAIL"
      ? "Please share your interview availability.\n\nThis is sample gallery content."
      : "We are hiring for an engineering role. Would you like to learn more?\n\nThis is sample gallery content.";
  const more = account.provider === "GMAIL" && !continuing;
  const id = continuing ? "sample-2" : "sample-1";
  const until = new Date(query.until).toISOString();
  const request = { ...query, search: query };
  const message = {
    externalId: id,
    subject,
    sender: "talent@amazon.example",
    senderName: "Sample recruiting team",
    recipient: account.email,
    bodyText,
    snippet: bodyText.slice(0, 100),
    receivedAt: new Date(Date.parse(until) - (continuing ? 7200000 : 3600000)).toISOString(),
    folders: [account.email.startsWith("second") ? "Junk Email" : "Inbox"],
    account: account.email,
    provider: account.provider as "GMAIL" | "OUTLOOK",
    identity: `${account.id}:${id}`,
    classification: classifyMail({ subject, bodyText }),
  };
  return {
    query,
    readOnly: true,
    window: { since: query.since ?? null, until, bounds: "since inclusive; until exclusive" },
    scope: "Gallery sample folders",
    accounts: [
      {
        accountId: account.id,
        account: account.email,
        provider: account.provider as "GMAIL" | "OUTLOOK",
        fetched: 3,
        returned: 1,
        skippedContext: 1,
        skippedOutsideWindow: 1,
        messages: [message],
        error: null,
        complete: !more,
        limited: false,
        totalFetched: continuing ? 6 : 3,
        effectiveQuery:
          account.provider === "GMAIL"
            ? gmailSearchQuery(request)
            : (outlookSearchQuery(request) ?? "Sample date-window filter"),
      },
    ],
    complete: !more,
    more,
    limited: false,
    nextCursor: more ? `demo:${encodeURIComponent(JSON.stringify(query))}` : null,
    warning: null,
  };
}
