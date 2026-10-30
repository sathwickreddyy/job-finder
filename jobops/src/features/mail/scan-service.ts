import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { mailConnections, mailMessages, mailEvents, mailTracking, settings } from "@/db/schema";
import { withConnectionLock } from "@/services/mail/providers/connections";
import { providerFor } from "@/services/mail/providers";
import type { MailConnection, MailFolder } from "@/services/mail/providers/types";
import { loadMailContext, type MailContext } from "./context";
import { matchMail } from "./matching";
import { importMailRecords, mailImportSchema } from "./import";
import { classifyMail } from "@/services/mail/classifier";

export type ScanScope = {
  company?: string;
  application?: string;
  account?: string;
};
export type ScanProgress = {
  since?: string;
  until: string;
  next?: string;
  complete: boolean;
  scanned: number;
  matched: number;
  folders: MailFolder[];
  mode: "latest" | "history";
  checkedAt: string;
};
export type ScanResult = {
  scanned: number;
  arrived: number;
  historical: number;
  excluded: number;
  more: boolean;
};
export class ScanFailure extends Error {
  constructor(
    message: string,
    readonly result: ScanResult,
  ) {
    super(message);
  }
}
export const coverageKey = (id: string) => `mailCoverage:${id}`;
export const scanRuleRevision = (context: MailContext) =>
  createHash("sha256")
    .update(JSON.stringify(context.companies.map((row) => ({ id: row.id, rule: row.rule }))))
    .digest("hex");
export const scanKey = (id: string, mode: string, scope: ScanScope) =>
  `mailScan:v2:${id}:${mode}:${createHash("sha256")
    .update(
      JSON.stringify({
        company: scope.company ?? "",
        application: scope.application ?? "",
      }),
    )
    .digest("hex")}`;
export async function scanContext(scope: ScanScope) {
  const context = await loadMailContext();
  const company = scope.application
    ? context.applications.find((app) => app.id === scope.application)?.company
    : scope.company;
  if (scope.application && !company) throw new Error("Choose an existing application.");
  if (company && !context.companies.some((row) => row.id === company))
    throw new Error("Choose an existing company.");
  return {
    context,
    selected: company
      ? {
          ...context,
          companies: context.companies.filter((row) => row.id === company),
        }
      : context,
  };
}

export async function scanConnection(
  connection: MailConnection,
  mode: "latest" | "history",
  scope: ScanScope,
  context: MailContext,
): Promise<ScanResult> {
  return withConnectionLock(connection.id, async (database, current) => {
    const provider = providerFor(current.provider);
    const key = scanKey(current.id, mode, scope);
    const rulesRevision = scanRuleRevision(context);
    const [saved] = await database.select().from(settings).where(eq(settings.key, key));
    const stored = saved?.value as (ScanProgress & { rulesRevision?: string }) | undefined;
    const baseline = context.baselineAt;
    const resumable = stored && !stored.complete && stored.rulesRevision === rulesRevision;
    const startedAt = new Date().toISOString();
    const progress: ScanProgress & { rulesRevision: string } = resumable
      ? { ...stored, rulesRevision }
      : {
          mode,
          until: startedAt,
          ...(mode === "latest"
            ? {
                since: new Date(
                  Math.max(
                    Date.parse(baseline) - 86400000,
                    stored?.complete && stored.rulesRevision === rulesRevision
                      ? Date.parse(stored.until) - 86400000
                      : 0,
                  ),
                ).toISOString(),
              }
            : {}),
          complete: false,
          scanned: 0,
          matched: 0,
          folders: [],
          checkedAt: startedAt,
          rulesRevision,
        };
    const total: ScanResult = {
      scanned: 0,
      arrived: 0,
      historical: 0,
      excluded: 0,
      more: false,
    };
    try {
      // The mailbox-wide messages endpoint includes nested folders. Inventory is
      // still traversed to label coverage and exclude sent/draft descendants.
      progress.folders = await provider.folders(current);
      await database
        .insert(settings)
        .values({
          key: coverageKey(current.id),
          value: {
            folders: progress.folders,
            checkedAt: startedAt,
            scope:
              "All provider-accessible mailbox folders; online archive mailboxes are not included",
          },
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: {
              folders: progress.folders,
              checkedAt: startedAt,
              scope:
                "All provider-accessible mailbox folders; online archive mailboxes are not included",
            },
            updatedAt: new Date(),
          },
        });
      const threads = await database
        .select({
          threadId: mailTracking.threadId,
          applicationIds: mailTracking.applicationIds,
        })
        .from(mailTracking)
        .where(
          and(
            eq(mailTracking.provider, current.provider),
            eq(mailTracking.accountEmail, current.email),
          ),
        );
      for (let pageNumber = 0; pageNumber < 1; pageNumber++) {
        const page = await provider.scanMail(
          current,
          { since: progress.since, until: progress.until, next: progress.next },
          progress.folders,
        );
        const delta = await database.transaction(async (tx) => {
          const delta: ScanResult = {
            scanned: page.messages.length,
            arrived: 0,
            historical: 0,
            excluded: 0,
            more: Boolean(page.next),
          };
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
            const threadApplications = raw.threadId
              ? threads
                  .filter((row) => row.threadId === raw.threadId)
                  .flatMap((row) => row.applicationIds)
              : [];
            const decision = matchMail(raw, context, {
              historical: mode === "history",
              seen: Boolean(previous),
              threadApplications,
            });
            // Company/app scoped scans observe other IDs but do not consume their
            // queue eligibility. The global scan must still be able to find them.
            const outside =
              (scope.company && !decision.companyKeys.includes(scope.company)) ||
              (scope.application && !decision.applicationIds.includes(scope.application));
            if (outside) continue;
            // A seen identity keeps its disposition and is never re-imported or reopened.
            const disposition =
              previous?.disposition ?? (decision.disposition === "excluded" ? "excluded" : "kept");
            let messageId = previous?.messageId ?? null;
            if (!previous && disposition === "kept") {
              const externalId = `${current.email}:${raw.externalId}`;
              await importMailRecords(
                mailImportSchema.parse([{ ...raw, externalId }]),
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
              const contactReply =
                decision.evidence.includes("Reply from a person you contacted") &&
                classifyMail(raw).type === "UNKNOWN";
              await tx
                .update(mailMessages)
                .set({
                  folders: raw.folders,
                  ...(decision.companyKeys.length === 1
                    ? { companyKey: decision.companyKeys[0] }
                    : {}),
                  ...(contactReply ? { classification: "FOLLOW_UP" as const } : {}),
                })
                .where(eq(mailMessages.id, message.id));
              const events = await tx
                .select()
                .from(mailEvents)
                .where(eq(mailEvents.mailMessageId, message.id));
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
              messageId = message.id;
            } else if (messageId && disposition === "kept")
              await tx
                .update(mailMessages)
                .set({ folders: raw.folders })
                .where(eq(mailMessages.id, messageId));
            const values = {
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
              disposition,
              reason: decision.reason,
              evidence: decision.evidence,
              updatedAt: new Date(),
            };
            const [saved] = previous
              ? await tx
                  .update(mailTracking)
                  .set(values)
                  .where(eq(mailTracking.id, previous.id))
                  .returning()
              : await tx
                  .insert(mailTracking)
                  .values(values)
                  .onConflictDoNothing({
                    target: [
                      mailTracking.provider,
                      mailTracking.accountEmail,
                      mailTracking.providerMessageId,
                    ],
                  })
                  .returning();
            // Provider pages may overlap internally as well as across requests.
            if (saved) {
              if (previous) Object.assign(previous, saved);
              else prior.push(saved);
            }
            if (!previous && saved) {
              if (disposition === "kept") delta.arrived++;
              else delta.excluded++;
            }
          }
          const checkpoint = {
            ...progress,
            next: page.next,
            complete: !page.next,
            scanned: progress.scanned + delta.scanned,
            matched: progress.matched + delta.arrived + delta.historical,
            checkedAt: new Date().toISOString(),
          };
          await tx
            .insert(settings)
            .values({ key, value: checkpoint })
            .onConflictDoUpdate({
              target: settings.key,
              set: { value: checkpoint, updatedAt: new Date() },
            });
          await tx
            .update(mailConnections)
            .set({
              lastRefreshedAt: new Date(),
              lastRefreshedCount: total.arrived + delta.arrived,
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(mailConnections.id, current.id));
          Object.assign(progress, checkpoint);
          return delta;
        });
        total.scanned += delta.scanned;
        total.arrived += delta.arrived;
        total.historical += delta.historical;
        total.excluded += delta.excluded;
        total.more = delta.more;
        if (!page.next) break;
      }
      return total;
    } catch (error) {
      const message =
        error instanceof Error &&
        !error.cause &&
        !/Failed query|token|secret|password|Zod/i.test(error.message)
          ? error.message
          : "Mail check interrupted. Committed pages are safe; retry to continue.";
      try {
        await database
          .update(mailConnections)
          .set({ lastError: message, updatedAt: new Date() })
          .where(eq(mailConnections.id, current.id));
      } catch {
        /* Preserve committed arrivals if the status write also fails. */
      }
      throw new ScanFailure(message, total);
    }
  });
}
