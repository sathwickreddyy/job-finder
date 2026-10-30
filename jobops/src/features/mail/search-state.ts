import type { searchMail } from "./search-service";
type BaseResponse = Awaited<ReturnType<typeof searchMail>>;
type BaseAccount = BaseResponse["accounts"][number];
export type SearchMessage = BaseAccount["messages"][number] & {
  decision?: { kept: boolean; reason: string; evidence: string[] };
};
export type CompanyTrackingInfo = {
  unavailable?: number;
  saved: number;
  alreadyKnown: number;
  excluded: number;
  cacheHit: boolean;
  resumed: boolean;
  checkpointPages: number;
  window: { since: string | null; until: string };
  rejected: { subject: string; sender: string; reason: string }[];
};
export type SearchAccountPage = Omit<BaseAccount, "messages"> & {
  messages: SearchMessage[];
  tracking?: CompanyTrackingInfo;
};
export type SearchResponse = Omit<BaseResponse, "accounts"> & {
  accounts: SearchAccountPage[];
  savedCompany?: string;
};
export type SavedCompanyMail = {
  messages: SearchMessage[];
  counts: { kept: number; excluded: number };
  nextBefore: string | null;
};
export type SearchAccount = { id: string; email: string; provider: string };
export type AccountRun = {
  account: SearchAccount;
  status: "waiting" | "requesting" | "paused" | "complete" | "failed" | "limited";
  pages: number;
  fetched: number;
  skippedContext: number;
  skippedOutsideWindow: number;
  messages: SearchMessage[];
  query: string | null;
  cursor: string | null;
  error: string | null;
  tracking?: CompanyTrackingInfo;
  events: { page: number; time: string; detail: string }[];
};
export function newAccountRun(account: SearchAccount): AccountRun {
  return {
    account,
    status: "waiting",
    pages: 0,
    fetched: 0,
    skippedContext: 0,
    skippedOutsideWindow: 0,
    messages: [],
    query: null,
    cursor: null,
    error: null,
    events: [],
  };
}
export function mergeSearchPage(run: AccountRun, response: SearchResponse): AccountRun {
  const page = response.accounts.find((row) => row.accountId === run.account.id);
  if (!page)
    throw new Error("The search response did not include this account. Retry to continue.");
  const messages = new Map(run.messages.map((message) => [message.identity, message]));
  page.messages.forEach((message) => messages.set(message.identity, message));
  const status = page.error
    ? "failed"
    : page.limited
      ? "limited"
      : page.complete
        ? "complete"
        : "paused";
  return {
    ...run,
    status,
    pages: page.tracking?.checkpointPages ?? run.pages + (page.error ? 0 : 1),
    fetched: page.totalFetched,
    skippedContext: run.skippedContext + page.skippedContext,
    skippedOutsideWindow: run.skippedOutsideWindow + page.skippedOutsideWindow,
    messages: [...messages.values()],
    query: page.effectiveQuery ?? run.query,
    cursor: response.nextCursor,
    error: page.error ?? response.warning,
    tracking: page.tracking
      ? {
          ...page.tracking,
          unavailable: (run.tracking?.unavailable ?? 0) + (page.tracking.unavailable ?? 0),
        saved: (run.tracking?.saved ?? 0) + page.tracking.saved,
          alreadyKnown: (run.tracking?.alreadyKnown ?? 0) + page.tracking.alreadyKnown,
          excluded: (run.tracking?.excluded ?? 0) + page.tracking.excluded,
          rejected: [...(run.tracking?.rejected ?? []), ...page.tracking.rejected],
        }
      : run.tracking,
    events: [
      ...run.events,
      {
        page: run.pages + 1,
        time: new Date().toISOString(),
        detail:
          page.error ??
          `Fetched ${page.fetched}; returned ${page.returned}; skipped ${page.skippedContext} sent/draft/outbox and ${page.skippedOutsideWindow} outside the window.${page.limited ? " Provider limit reached." : page.complete ? " Search complete." : " More pages available."}`,
      },
    ],
  };
}
export function allSearchMessages(runs: AccountRun[]) {
  return runs
    .flatMap((run) => run.messages)
    .sort(
      (a, b) =>
        Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || a.identity.localeCompare(b.identity),
    );
}
