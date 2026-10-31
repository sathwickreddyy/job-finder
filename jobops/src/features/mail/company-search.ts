import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mailConnections, mailTracking, settings } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { providerFor } from "@/services/mail/providers";
import { withConnectionLock } from "@/services/mail/providers/connections";
import {
  gmailSearchQuery,
  outlookSearchQuery,
  type SearchRequest,
} from "@/services/mail/providers/search-query";
import type { MailConnection, ProviderId } from "@/services/mail/providers/types";
import { failureText, recoveryCutoff } from "./check-service";
import type { CompanyMailRule } from "./company-rules";
import { loadMailContext, type MailContext, type WorkspaceCompany } from "./context";
import { listDropped } from "./dropped";
import { ingestPage, noCounts, type IngestCounts, type IngestItem } from "./ingest";

const dayMs = 24 * 60 * 60 * 1000;
/** Company search reads only one company's mail, so it can reach back ten years. */
export const maxSearchDays = 3650;
const defaultSearchDays = 90;

export type SearchLane = {
  account: string;
  provider: ProviderId;
  state: "searching" | "done" | "failed";
  query: string;
  counts: IngestCounts;
  items: IngestItem[];
  error: string | null;
};
/** How many kept emails each kind of rule found, and how many Never include left out. */
export type RuleHits = { addresses: number; domains: number; keywords: number; never: number };
export type SearchRun = {
  key: string;
  since: string;
  until: string;
  accounts: string[];
  startedAt: string;
  finishedAt: string | null;
  counts: IngestCounts;
  ruleHits: RuleHits;
};
/**
 * One inbox's place in a company's search. `coveredUntil` is how far this inbox has been
 * searched without a gap, across runs, so a failed or unticked inbox is never skipped.
 */
type SearchCursor = { startedAt: string; next?: string; complete: boolean; coveredUntil?: string };

const runKey = (key: string) => `companySearchRun:${key}`;
const cursorKey = (key: string, connectionId: string) => `companySearch:${key}:${connectionId}`;
const noHits = (): RuleHits => ({ addresses: 0, domains: 0, keywords: 0, never: 0 });
const add = (total: IngestCounts, page: IngestCounts): IngestCounts => ({
  fetched: total.fetched + page.fetched,
  alreadyHere: total.alreadyHere + page.alreadyHere,
  kept: total.kept + page.kept,
  dropped: total.dropped + page.dropped,
  newAttention: total.newAttention + page.newAttention,
});

function identityFor(rule: CompanyMailRule): SearchRequest["identity"] {
  return {
    names: [rule.company, ...rule.aliases],
    keywords: rule.keywords,
    senders: rule.senders,
    domains: rule.domains,
  };
}
/** The exact query an inbox would receive; a rule term that can't be searched shows why. */
function queryFor(provider: string, request: SearchRequest) {
  try {
    return provider === "GMAIL" ? gmailSearchQuery(request) : outlookSearchQuery(request);
  } catch (error) {
    return error instanceof Error ? error.message : "This rule can't be searched.";
  }
}
function hitsFrom(items: IngestItem[]): RuleHits {
  const hits = noHits();
  for (const item of items) {
    if (!item.kept) {
      if (item.reason === "Matches a company exclusion rule") hits.never++;
      continue;
    }
    if (item.evidence.includes("Exact sender rule")) hits.addresses++;
    if (item.evidence.includes("Company sender domain")) hits.domains++;
    if (
      item.evidence.includes("Keyword in subject or sender name") ||
      item.evidence.includes("Company name in subject")
    )
      hits.keywords++;
  }
  return hits;
}
async function companyFor(key: string, context?: MailContext): Promise<WorkspaceCompany> {
  const company = (context ?? (await loadMailContext())).companies.find((row) => row.id === key);
  if (!company) throw new ApiError("Company not found.", 404);
  return company;
}
async function readRun(key: string): Promise<SearchRun | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, runKey(key)));
  return (row?.value as SearchRun | undefined) ?? null;
}
async function writeSetting(key: string, value: Record<string, unknown>) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

/** One page for one inbox under its connection lock. A failure stays on its own lane. */
async function searchInbox(
  connection: MailConnection,
  run: SearchRun,
  company: WorkspaceCompany,
  context: MailContext,
): Promise<SearchLane> {
  const request: SearchRequest = {
    since: run.since,
    until: run.until,
    identity: identityFor(company.rule),
  };
  const lane = (patch: Partial<SearchLane>): SearchLane => ({
    account: connection.email,
    provider: connection.provider as ProviderId,
    state: "done",
    query: queryFor(connection.provider, request),
    counts: noCounts(),
    items: [],
    error: null,
    ...patch,
  });
  const [saved] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, cursorKey(company.id, connection.id)));
  const stored = saved?.value as SearchCursor | undefined;
  const cursor: SearchCursor =
    stored?.startedAt === run.startedAt
      ? stored
      : { startedAt: run.startedAt, complete: false, coveredUntil: stored?.coveredUntil };
  if (cursor.complete) return lane({});
  try {
    return await withConnectionLock(connection.id, async (database, current) => {
      const provider = providerFor(current.provider);
      const folders = await provider.folders(current);
      const page = await provider.searchMail(current, { ...request, next: cursor.next }, folders);
      const threads = await database
        .select({ threadId: mailTracking.threadId, applicationIds: mailTracking.applicationIds })
        .from(mailTracking)
        .where(
          and(
            eq(mailTracking.provider, current.provider),
            eq(mailTracking.accountEmail, current.email),
          ),
        );
      return database.transaction(async (tx) => {
        const { counts, items } = await ingestPage(tx, {
          connection: current,
          providerId: provider.id,
          messages: page.messages,
          context,
          threads,
          // An inbox never fetched has no new mail to flag: everything found is history.
          recoveredBefore: recoveryCutoff(current.lastSyncedAt) ?? new Date(run.startedAt),
          preferCompany: company.id,
        });
        // Finishing a window that starts within this inbox's coverage extends it.
        const extendsCoverage =
          !page.next &&
          (!cursor.coveredUntil || Date.parse(run.since) <= Date.parse(cursor.coveredUntil));
        const next: SearchCursor = {
          startedAt: run.startedAt,
          next: page.next,
          complete: !page.next,
          coveredUntil: extendsCoverage ? run.until : cursor.coveredUntil,
        };
        await tx
          .insert(settings)
          .values({ key: cursorKey(company.id, current.id), value: next })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: next, updatedAt: new Date() },
          });
        return lane({
          state: page.next ? "searching" : "done",
          query: page.query,
          counts,
          items,
        });
      });
    });
  } catch (error) {
    return lane({ state: "failed", error: failureText(error) });
  }
}

/**
 * One page per selected inbox for a company's search. `lastDays`, `accounts` or `restart`
 * start a new run (default: since the last run, or the last 90 days); a call with none of
 * them continues the unfinished run. Call again while `more` is true.
 */
export async function companySearchStep(
  key: string,
  options: { lastDays?: number; accounts?: string[]; restart?: boolean },
): Promise<{ more: boolean; run: SearchRun; lanes: SearchLane[] }> {
  const { lastDays, accounts, restart } = options;
  if (
    lastDays !== undefined &&
    !(Number.isInteger(lastDays) && lastDays >= 1 && lastDays <= maxSearchDays)
  )
    throw new ApiError("Company search goes back up to 3650 days (10 years).", 400);
  const context = await loadMailContext();
  const company = await companyFor(key, context);
  const connections = await db.select().from(mailConnections).orderBy(mailConnections.createdAt);
  if (!connections.length) throw new ApiError("Connect an inbox before searching mail.", 409);
  const previous = await readRun(company.id);
  const now = new Date();
  const chosen = accounts ? connections.filter((row) => accounts.includes(row.email)) : connections;
  if (!chosen.length) throw new ApiError("Choose at least one connected inbox.", 400);
  const emails = chosen.map((row) => row.email).sort();
  // A press repeating an unfinished run's inboxes and window continues it, page by page.
  const continues =
    previous !== null &&
    !previous.finishedAt &&
    !restart &&
    (!accounts || emails.join() === [...previous.accounts].sort().join()) &&
    (lastDays === undefined || Date.parse(previous.since) <= now.getTime() - lastDays * dayMs);
  let run: SearchRun;
  if (continues) run = previous;
  else {
    let since = new Date(now.getTime() - (lastDays ?? defaultSearchDays) * dayMs).toISOString();
    if (lastDays === undefined) {
      // From the inbox searched least far, so none is left with a gap.
      const cursors = await db
        .select()
        .from(settings)
        .where(
          inArray(
            settings.key,
            chosen.map((row) => cursorKey(company.id, row.id)),
          ),
        );
      const covered = chosen.map(
        (row) =>
          (
            cursors.find((item) => item.key === cursorKey(company.id, row.id))?.value as
              SearchCursor | undefined
          )?.coveredUntil,
      );
      if (covered.every(Boolean)) since = (covered as string[]).sort()[0];
    }
    run = {
      key: company.id,
      since,
      until: now.toISOString(),
      accounts: emails,
      startedAt: now.toISOString(),
      finishedAt: null,
      counts: noCounts(),
      ruleHits: noHits(),
    };
  }
  const current = run;
  const selected = connections.filter((row) => current.accounts.includes(row.email));
  const lanes = await Promise.all(
    selected.map((row) => searchInbox(row, current, company, context)),
  );
  const more = lanes.some((lane) => lane.state === "searching");
  const hits = hitsFrom(lanes.flatMap((lane) => lane.items));
  run = {
    ...current,
    counts: lanes.reduce((total, lane) => add(total, lane.counts), current.counts),
    ruleHits: {
      addresses: current.ruleHits.addresses + hits.addresses,
      domains: current.ruleHits.domains + hits.domains,
      keywords: current.ruleHits.keywords + hits.keywords,
      never: current.ruleHits.never + hits.never,
    },
    finishedAt: more ? null : new Date().toISOString(),
  };
  await writeSetting(runKey(company.id), run);
  return { more, run, lanes };
}

/** What the company panel shows: the rule, inboxes, the last run and the next queries. */
export async function readCompanySearch(key: string): Promise<{
  rule: CompanyMailRule;
  ruleSource: string;
  inboxes: { account: string; provider: ProviderId }[];
  lastRun: SearchRun | null;
  ruleHits: RuleHits | null;
  queries: Record<string, string>;
  dropped: IngestItem[];
}> {
  const company = await companyFor(key);
  const [connections, lastRun] = await Promise.all([
    db.select().from(mailConnections).orderBy(mailConnections.createdAt),
    readRun(company.id),
  ]);
  const now = Date.now();
  const request: SearchRequest = {
    since: lastRun?.until ?? new Date(now - defaultSearchDays * dayMs).toISOString(),
    until: new Date(now).toISOString(),
    identity: identityFor(company.rule),
  };
  return {
    rule: company.rule,
    ruleSource: company.ruleSource,
    inboxes: connections.map((row) => ({
      account: row.email,
      provider: row.provider as ProviderId,
    })),
    lastRun,
    ruleHits: lastRun?.ruleHits ?? null,
    queries: Object.fromEntries(
      connections.map((row) => [row.email, queryFor(row.provider, request)]),
    ),
    dropped: lastRun ? await listDropped({ since: lastRun.startedAt, company: company.id }) : [],
  };
}
