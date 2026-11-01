import { and, eq, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db";
import { mailConnections, mailTracking, settings } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { providerFor } from "@/services/mail/providers";
import { withConnectionLock } from "@/services/mail/providers/connections";
import type { MailConnection, MailFolder, ProviderId } from "@/services/mail/providers/types";
import {
  meteredCalls,
  meteredSummary,
  RateLimitError,
  summarize,
  usageKey,
  type ApiCall,
  type StoredUsage,
  type UsageSummary,
} from "@/services/mail/providers/usage";
import { loadMailContext, type MailContext } from "./context";
import { ingestPage, noCounts, type IngestCounts } from "./ingest";

/** The pre-cutover unscoped latest-scan key; its window carries over as each account's last fetch. */
export const checkKey = (connectionId: string) =>
  `mailScan:v2:${connectionId}:latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312`;
export const coverageKey = (connectionId: string) => `mailCoverage:${connectionId}`;
const overlapMs = 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
/** Fetch reads every message in the window, so it stops at 180 days; company search goes further. */
export const maxFetchDays = 180;
/**
 * Mail older than this was due in an earlier fetch: found now, it is recovered history and
 * arrives handled. The overlap hour stays open for late-indexed mail.
 */
export const recoveryCutoff = (lastSyncedAt: Date | null) =>
  lastSyncedAt ? new Date(lastSyncedAt.getTime() - overlapMs) : null;

export type CheckProgress = {
  since: string;
  until: string;
  next?: string;
  complete: boolean;
  scanned: number;
  folders: MailFolder[];
  checkedAt: string;
};
export type AccountCheck = {
  account: string;
  provider: string;
  /** `waiting`: the provider asked JobOps to slow down; the inbox resumes after `retryAt`. */
  status: "done" | "more" | "failed" | "waiting";
  error: string | null;
  lastFetchedAt: string | null;
  /** This step's page; the client adds steps up for the whole fetch. */
  counts: IngestCounts;
  /** Where the window being fetched starts, or null when it is not known yet. */
  since: string | null;
  until: string | null;
  retryAt: string | null;
  /** Every provider request this step sent for the inbox, in order. */
  calls: ApiCall[];
  usage: UsageSummary | null;
};
export type CheckResult = { more: boolean; newAttention: number; accounts: AccountCheck[] };

/**
 * Resume an unfinished window unchanged; otherwise fetch from the last fetch (minus overlap)
 * to now. `lastDays` starts a new window that reaches back that many days, or to the last
 * fetch when that is earlier, so a fetch never leaves a gap.
 */
export function checkWindow(
  stored: CheckProgress | undefined,
  releasedAt: string,
  now: Date,
  lastDays?: number,
): CheckProgress {
  // An unfinished window is resumed, also by a Last N days press it already reaches back
  // for; restarting it would re-read the newest pages on every press.
  if (
    stored &&
    !stored.complete &&
    (lastDays === undefined || Date.parse(stored.since) <= now.getTime() - lastDays * dayMs)
  )
    return stored;
  const until = now.toISOString();
  // An unfinished window has only covered mail up to its start.
  const covered = stored
    ? stored.complete
      ? Date.parse(stored.until) - overlapMs
      : Date.parse(stored.since)
    : Date.parse(releasedAt);
  const since =
    lastDays === undefined ? covered : Math.min(covered, now.getTime() - lastDays * dayMs);
  return {
    since: new Date(since).toISOString(),
    until,
    complete: false,
    scanned: 0,
    folders: [],
    checkedAt: until,
  };
}

export function failureText(error: unknown) {
  return error instanceof Error &&
    !(error instanceof ZodError) &&
    !error.cause &&
    !/Failed query|token|secret|password|Zod/i.test(error.message)
    ? error.message
    : "Mail check interrupted. Committed pages are safe; check again to continue.";
}

/** One provider page for one account. Provider and token errors become a failed status. */
export async function checkConnection(
  connection: MailConnection,
  context: MailContext,
  lastDays?: number,
): Promise<AccountCheck & { newAttention: number }> {
  let since: string | null = null;
  let until: string | null = null;
  const failed = (error: unknown, lastFetchedAt: Date | null) => ({
    account: connection.email,
    provider: connection.provider,
    status: error instanceof RateLimitError ? ("waiting" as const) : ("failed" as const),
    error: failureText(error),
    lastFetchedAt: lastFetchedAt?.toISOString() ?? null,
    newAttention: 0,
    counts: noCounts(),
    since,
    until,
    retryAt: error instanceof RateLimitError ? error.cooldown.until : null,
    calls: meteredCalls(),
    usage: meteredSummary(),
  });
  try {
    return await withConnectionLock(connection.id, async (database, current) => {
      try {
        const provider = providerFor(current.provider);
        // One query at a time: the lock holds a single connection.
        const [saved] = await database
          .select()
          .from(settings)
          .where(eq(settings.key, checkKey(current.id)));
        const [released] = await database
          .select()
          .from(settings)
          .where(eq(settings.key, "mailCheckReleasedAt"));
        const releasedAt =
          typeof released?.value.at === "string" && Number.isFinite(Date.parse(released.value.at))
            ? new Date(released.value.at).toISOString()
            : new Date().toISOString();
        const progress = checkWindow(
          saved?.value as CheckProgress | undefined,
          releasedAt,
          new Date(),
          lastDays,
        );
        since = progress.since;
        until = progress.until;
        const folders = await provider.folders(current);
        const coverage = {
          folders,
          checkedAt: new Date().toISOString(),
          scope:
            "All provider-accessible mailbox folders; online archive mailboxes are not included",
        };
        await database
          .insert(settings)
          .values({ key: coverageKey(current.id), value: coverage })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: coverage, updatedAt: new Date() },
          });
        const threads = await database
          .select({ threadId: mailTracking.threadId, applicationIds: mailTracking.applicationIds })
          .from(mailTracking)
          .where(
            and(
              eq(mailTracking.provider, current.provider),
              eq(mailTracking.accountEmail, current.email),
            ),
          );
        const page = await provider.scanMail(
          current,
          { since: progress.since, until: progress.until, next: progress.next },
          folders,
        );
        return await database.transaction(async (tx) => {
          const { counts } = await ingestPage(tx, {
            connection: current,
            providerId: provider.id,
            messages: page.messages,
            context,
            threads,
            // A first Last N days fetch has no last fetch: mail before release is history too.
            recoveredBefore:
              recoveryCutoff(current.lastSyncedAt) ??
              (lastDays !== undefined ? new Date(releasedAt) : null),
          });
          const newAttention = counts.newAttention;
          const complete = !page.next;
          const checkpoint: CheckProgress = {
            ...progress,
            next: page.next,
            complete,
            scanned: progress.scanned + page.messages.length,
            folders,
            checkedAt: new Date().toISOString(),
          };
          await tx
            .insert(settings)
            .values({ key: checkKey(current.id), value: checkpoint })
            .onConflictDoUpdate({
              target: settings.key,
              set: { value: checkpoint, updatedAt: new Date() },
            });
          const lastSyncedAt = complete ? new Date(progress.until) : current.lastSyncedAt;
          await tx
            .update(mailConnections)
            .set({
              lastRefreshedAt: new Date(),
              lastRefreshedCount: newAttention,
              lastError: null,
              lastSyncedAt,
              updatedAt: new Date(),
            })
            .where(eq(mailConnections.id, current.id));
          return {
            account: current.email,
            provider: current.provider,
            status: complete ? ("done" as const) : ("more" as const),
            error: null,
            lastFetchedAt: lastSyncedAt?.toISOString() ?? null,
            newAttention,
            counts,
            since: progress.since,
            until: progress.until,
            retryAt: null,
            calls: meteredCalls(),
            usage: meteredSummary(),
          };
        });
      } catch (error) {
        try {
          // A rate limit pauses the inbox; it isn't a connection problem to fix in Inboxes.
          await database
            .update(mailConnections)
            .set({
              lastError: error instanceof RateLimitError ? null : failureText(error),
              updatedAt: new Date(),
            })
            .where(eq(mailConnections.id, current.id));
        } catch {
          /* Committed pages stay safe even if the status write also fails. */
        }
        return failed(error, current.lastSyncedAt);
      }
    });
  } catch (error) {
    // The connection lock itself failed, for example after a disconnect.
    return failed(error, connection.lastSyncedAt);
  }
}

/**
 * One page per account. Accounts in the middle of a window go first so a check
 * finishes before new windows open; an account that failed mid-window does not
 * hold the others back. Only a step that checked every account can end the check.
 */
export async function checkMailStep(options: { lastDays?: number } = {}): Promise<CheckResult> {
  const { lastDays } = options;
  if (
    lastDays !== undefined &&
    !(Number.isInteger(lastDays) && lastDays >= 1 && lastDays <= maxFetchDays)
  )
    throw new ApiError(
      "Fetch goes back up to 180 days. For older mail, search a company from its page.",
      400,
    );
  const connections = await db.select().from(mailConnections).orderBy(mailConnections.createdAt);
  if (!connections.length) throw new ApiError("Connect an inbox before checking mail.", 409);
  const [context, saved] = await Promise.all([
    loadMailContext(),
    db
      .select()
      .from(settings)
      .where(
        inArray(
          settings.key,
          connections.flatMap((row) => [checkKey(row.id), usageKey(row.id)]),
        ),
      ),
  ]);
  const now = new Date();
  const usageOf = (row: (typeof connections)[number]) =>
    summarize(
      row.provider as ProviderId,
      saved.find((setting) => setting.key === usageKey(row.id))?.value as StoredUsage | undefined,
      now,
    );
  // A paused inbox isn't asked again until its provider's retry time.
  const ready = connections.filter((row) => !usageOf(row).cooldown);
  const incomplete = ready.filter(
    (row) =>
      !row.lastError &&
      saved.find((setting) => setting.key === checkKey(row.id))?.value.complete === false,
  );
  // A last-N-days fetch starts a new window for every inbox, replacing unfinished ones.
  const active = lastDays === undefined && incomplete.length ? incomplete : ready;
  const results = await Promise.allSettled(
    active.map((row) => checkConnection(row, context, lastDays)),
  );
  const stepped = new Map(
    active.map((row, index) => {
      const result = results[index];
      return [
        row.id,
        result.status === "fulfilled"
          ? result.value
          : {
              account: row.email,
              provider: row.provider,
              status: "failed" as const,
              error: failureText(result.reason),
              lastFetchedAt: row.lastSyncedAt?.toISOString() ?? null,
              newAttention: 0,
              counts: noCounts(),
              since: null,
              until: null,
              retryAt: null,
              calls: [],
              usage: usageOf(row),
            },
      ];
    }),
  );
  const accounts = connections.map((row): AccountCheck => {
    const result = stepped.get(row.id);
    if (result)
      return {
        account: result.account,
        provider: result.provider,
        status: result.status,
        error: result.error,
        lastFetchedAt: result.lastFetchedAt,
        counts: result.counts,
        since: result.since,
        until: result.until,
        retryAt: result.retryAt,
        calls: result.calls,
        usage: result.usage,
      };
    const window = saved.find((setting) => setting.key === checkKey(row.id))?.value;
    const usage = usageOf(row);
    // Paused, or waiting for the step that checks every inbox from its last fetch to now.
    return {
      account: row.email,
      provider: row.provider,
      status: usage.cooldown ? "waiting" : "more",
      error: usage.cooldown
        ? new RateLimitError(row.provider as ProviderId, usage.cooldown).message
        : null,
      lastFetchedAt: row.lastSyncedAt?.toISOString() ?? null,
      counts: noCounts(),
      since: (window?.since as string) ?? null,
      until: (window?.until as string) ?? null,
      retryAt: usage.cooldown?.until ?? null,
      calls: [],
      usage,
    };
  });
  return {
    // Finishing or failing a resumed window still leaves later mail unchecked.
    more:
      (lastDays === undefined && incomplete.length > 0) ||
      accounts.some((row) => row.status === "more"),
    newAttention: [...stepped.values()].reduce((sum, row) => sum + row.newAttention, 0),
    accounts,
  };
}
