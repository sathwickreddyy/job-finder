import { describe, expect, it } from "vitest";
import {
  mergeSearchPage,
  newAccountRun,
  allSearchMessages,
  type SearchResponse,
} from "./search-state";
const account = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "me@example.com",
  provider: "GMAIL",
};
function page(extra: Record<string, unknown> = {}): SearchResponse {
  const message = {
    externalId: "one",
    identity: `${account.id}:one`,
    subject: "Unrecognized reply",
    sender: "person@example.com",
    receivedAt: "2026-10-29T00:00:00Z",
    folders: ["Spam"],
    account: account.email,
    provider: "GMAIL" as const,
    classification: {
      type: "UNKNOWN" as const,
      confidence: 0.2,
      relevant: false,
      reasons: ["No phrase matched"],
    },
  };
  return {
    query: { keywords: [], senders: [], subjects: [], until: "2026-10-30T00:00:00Z" },
    readOnly: true,
    window: {
      since: null,
      until: "2026-10-30T00:00:00Z",
      bounds: "since inclusive; until exclusive",
    },
    scope: "Incoming",
    accounts: [
      {
        accountId: account.id,
        account: account.email,
        provider: "GMAIL",
        fetched: 3,
        returned: 1,
        skippedContext: 1,
        skippedOutsideWindow: 1,
        messages: [message],
        error: null,
        complete: false,
        limited: false,
        totalFetched: 3,
        effectiveQuery: "actual query",
        ...extra,
      },
    ],
    complete: false,
    more: true,
    limited: false,
    nextCursor: "opaque",
    warning: null,
  };
}
describe("mail search UI state", () => {
  it("retains unknown messages, actual queries, page counts and skip reasons", () => {
    const run = mergeSearchPage(newAccountRun(account), page());
    expect(run).toMatchObject({
      status: "paused",
      pages: 1,
      fetched: 3,
      skippedContext: 1,
      skippedOutsideWindow: 1,
      query: "actual query",
      cursor: "opaque",
    });
    expect(run.messages[0].classification.type).toBe("UNKNOWN");
    expect(run.events[0].detail).toContain("outside the window");
  });
  it("deduplicates replayed messages and preserves counts and activity across pages", () => {
    const first = mergeSearchPage(newAccountRun(account), page());
    const next = mergeSearchPage(first, page({ complete: true, totalFetched: 6 }));
    expect(next.messages).toHaveLength(1);
    expect(next.pages).toBe(2);
    expect(next.fetched).toBe(6);
    expect(next.skippedContext).toBe(2);
    expect(next.status).toBe("complete");
    expect(next.events).toHaveLength(2);
  });
  it("keeps previous results and cursor for a failed account without claiming completion", () => {
    const first = mergeSearchPage(newAccountRun(account), page());
    const failed = mergeSearchPage(
      first,
      page({
        error: "Retry connection",
        fetched: 0,
        returned: 0,
        totalFetched: 3,
        messages: [],
        skippedContext: 0,
        skippedOutsideWindow: 0,
      }),
    );
    expect(failed.status).toBe("failed");
    expect(failed.pages).toBe(1);
    expect(failed.messages).toHaveLength(1);
    expect(failed.cursor).toBe("opaque");
    expect(failed.error).toBe("Retry connection");
  });
  it("does not present provider-limited coverage as complete", () => {
    expect(
      mergeSearchPage(newAccountRun(account), page({ limited: true, complete: false })).status,
    ).toBe("limited");
  });
  it("rejects an account mismatch instead of silently dropping results", () => {
    expect(() => mergeSearchPage(newAccountRun({ ...account, id: "different" }), page())).toThrow(
      "did not include",
    );
  });
  it("merges accounts newest-first with stable message identities", () => {
    const a = mergeSearchPage(newAccountRun(account), page());
    const b = {
      ...a,
      messages: a.messages.map((m) => ({
        ...m,
        identity: "second",
        receivedAt: "2026-10-30T00:00:00Z",
      })),
    };
    expect(allSearchMessages([a, b]).map((m) => m.identity)).toEqual([
      "second",
      `${account.id}:one`,
    ]);
  });
});
