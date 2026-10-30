import { and, eq, inArray, or } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db";
import { mailConnections, mailEvents, mailMessages, mailTracking, settings } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { classifyMail } from "@/services/mail/classifier";
import { providerFor } from "@/services/mail/providers";
import { withConnectionLock } from "@/services/mail/providers/connections";
import type { MailConnection, MailFolder } from "@/services/mail/providers/types";
import { loadMailContext, type MailContext } from "./context";
import { importMailRecords, mailImportSchema } from "./import";
import { matchMail } from "./matching";

/** The pre-cutover unscoped latest-scan key; its window carries over as each account's last fetch. */
export const checkKey = (connectionId: string) =>
  `mailScan:v2:${connectionId}:latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312`;
export const coverageKey = (connectionId: string) => `mailCoverage:${connectionId}`;
const overlapMs = 60 * 60 * 1000;

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
  status: "done" | "more" | "failed";
  error: string | null;
  lastFetchedAt: string | null;
};
export type CheckResult = { more: boolean; newAttention: number; accounts: AccountCheck[] };

/** Resume an unfinished window unchanged; otherwise fetch from the last fetch (minus overlap) to now. */
export function checkWindow(
  stored: CheckProgress | undefined,
  releasedAt: string,
  now: Date,
): CheckProgress {
  if (stored && !stored.complete) return stored;
  const until = now.toISOString();
  return {
    since: stored ? new Date(Date.parse(stored.until) - overlapMs).toISOString() : releasedAt,
    until,
    complete: false,
    scanned: 0,
    folders: [],
    checkedAt: until,
  };
}

function failureText(error: unknown) {
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
): Promise<AccountCheck & { newAttention: number }> {
  const failed = (error: unknown, lastFetchedAt: Date | null) => ({
    account: connection.email,
    provider: connection.provider,
    status: "failed" as const,
    error: failureText(error),
    lastFetchedAt: lastFetchedAt?.toISOString() ?? null,
    newAttention: 0,
  });
  try {
    return await withConnectionLock(connection.id, async (database, current) => {
      try {
        const provider = providerFor(current.provider);
        const [[saved], [released]] = await Promise.all([
          database
            .select()
            .from(settings)
            .where(eq(settings.key, checkKey(current.id))),
          database.select().from(settings).where(eq(settings.key, "mailCheckReleasedAt")),
        ]);
        const releasedAt =
          typeof released?.value.at === "string" && Number.isFinite(Date.parse(released.value.at))
            ? new Date(released.value.at).toISOString()
            : new Date().toISOString();
        const progress = checkWindow(
          saved?.value as CheckProgress | undefined,
          releasedAt,
          new Date(),
        );
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
          let newAttention = 0;
          const ids = page.messages.map((message) => message.externalId);
          const internetIds = page.messages.flatMap((message) =>
            message.internetMessageId ? [message.internetMessageId] : [],
          );
          const prior = ids.length
            ? await tx
                .select()
                .from(mailTracking)
                .where(
                  and(
                    eq(mailTracking.provider, current.provider),
                    eq(mailTracking.accountEmail, current.email),
                    or(
                      inArray(mailTracking.providerMessageId, [
                        ...ids,
                        ...ids.map((id) => `legacy:${id}`),
                      ]),
                      ...(internetIds.length
                        ? [inArray(mailTracking.internetMessageId, internetIds)]
                        : []),
                    ),
                  ),
                )
            : [];
          for (const raw of page.messages) {
            if (raw.contextOnly) continue;
            const previous =
              prior.find((row) => row.providerMessageId === raw.externalId) ??
              prior.find(
                (row) =>
                  row.providerMessageId.startsWith("legacy:") &&
                  (row.providerMessageId === `legacy:${raw.externalId}` ||
                    (raw.internetMessageId && row.internetMessageId === raw.internetMessageId)),
              );
            // A seen identity only records where it lives now; it is never re-imported or reopened.
            if (previous) {
              await tx
                .update(mailTracking)
                .set({ folders: raw.folders, updatedAt: new Date() })
                .where(eq(mailTracking.id, previous.id));
              if (previous.disposition === "kept" && previous.messageId)
                await tx
                  .update(mailMessages)
                  .set({ folders: raw.folders })
                  .where(eq(mailMessages.id, previous.messageId));
              continue;
            }
            const decision = matchMail(raw, context, {
              historical: false,
              seen: false,
              threadApplications: raw.threadId
                ? threads
                    .filter((row) => row.threadId === raw.threadId)
                    .flatMap((row) => row.applicationIds)
                : [],
            });
            const externalId = `${current.email}:${raw.externalId}`;
            // Providers can return mail the importer cannot store (no sender, an over-long
            // name). Record such an identity as excluded instead of failing the whole page.
            const record = mailImportSchema.safeParse([
              {
                ...raw,
                externalId,
                subject: raw.subject.trim() || "(No subject)",
                senderName: (raw.senderName ?? "").slice(0, 500),
              },
            ]);
            const kept = decision.disposition !== "excluded" && record.success;
            let messageId: string | null = null;
            if (kept) {
              const imported = await importMailRecords(
                record.data!,
                provider.id,
                current.email,
                tx,
              );
              const [message] = await tx
                .select({ id: mailMessages.id })
                .from(mailMessages)
                .where(
                  and(
                    eq(mailMessages.provider, provider.id),
                    eq(mailMessages.externalId, externalId),
                  ),
                );
              messageId = message.id;
              if (imported.imported) {
                newAttention++;
                const contactReply =
                  decision.evidence.includes("Reply from a person you contacted") &&
                  classifyMail(raw).type === "UNKNOWN";
                await tx
                  .update(mailMessages)
                  .set({
                    folders: raw.folders,
                    attentionState: "OPEN",
                    ...(decision.companyKeys.length === 1
                      ? { companyKey: decision.companyKeys[0] }
                      : {}),
                    ...(contactReply ? { classification: "FOLLOW_UP" as const } : {}),
                  })
                  .where(eq(mailMessages.id, messageId));
                const events = await tx
                  .select()
                  .from(mailEvents)
                  .where(eq(mailEvents.mailMessageId, messageId));
                for (const event of events) {
                  const details = { ...event.details };
                  delete details.suggestedApplicationId;
                  await tx
                    .update(mailEvents)
                    .set({
                      ...(contactReply ? { type: "FOLLOW_UP" as const, confidence: 0.75 } : {}),
                      details: {
                        ...details,
                        ...(decision.applicationIds.length === 1
                          ? { suggestedApplicationId: decision.applicationIds[0] }
                          : {}),
                        matchEvidence: decision.evidence,
                      },
                    })
                    .where(eq(mailEvents.id, event.id));
                }
              }
            }
            const [saved] = await tx
              .insert(mailTracking)
              .values({
                provider: current.provider,
                accountEmail: current.email,
                providerMessageId: raw.externalId,
                internetMessageId: raw.internetMessageId ?? null,
                messageId,
                threadId: raw.threadId ?? null,
                sender: raw.sender.slice(0, 1000),
                senderName: (raw.senderName ?? "").slice(0, 500),
                subject: raw.subject.slice(0, 2000),
                receivedAt: new Date(raw.receivedAt),
                folders: raw.folders,
                companyKeys: decision.companyKeys,
                applicationIds: decision.applicationIds,
                disposition: kept ? "kept" : "excluded",
                reason: record.success
                  ? decision.reason
                  : "Unreadable message; open it in your mailbox",
                evidence: decision.evidence,
              })
              .onConflictDoNothing({
                target: [
                  mailTracking.provider,
                  mailTracking.accountEmail,
                  mailTracking.providerMessageId,
                ],
              })
              .returning();
            // Provider pages can repeat an identity within one page.
            if (saved) prior.push(saved);
          }
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
          };
        });
      } catch (error) {
        try {
          await database
            .update(mailConnections)
            .set({ lastError: failureText(error), updatedAt: new Date() })
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
 * hold the others back.
 */
export async function checkMailStep(): Promise<CheckResult> {
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
          connections.map((row) => checkKey(row.id)),
        ),
      ),
  ]);
  const incomplete = connections.filter(
    (row) =>
      !row.lastError &&
      saved.find((setting) => setting.key === checkKey(row.id))?.value.complete === false,
  );
  const active = incomplete.length ? incomplete : connections;
  const results = await Promise.allSettled(active.map((row) => checkConnection(row, context)));
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
      };
    return {
      account: row.email,
      provider: row.provider,
      status: row.lastError ? "failed" : "done",
      error: row.lastError,
      lastFetchedAt: row.lastSyncedAt?.toISOString() ?? null,
    };
  });
  // Finishing a resumed window leaves mail since that window unchecked, so the next
  // step opens fresh windows for every inbox.
  const resumedDone =
    incomplete.length > 0 && [...stepped.values()].some((row) => row.status === "done");
  return {
    more: accounts.some((row) => row.status === "more") || resumedDone,
    newAttention: [...stepped.values()].reduce((sum, row) => sum + row.newAttention, 0),
    accounts,
  };
}
