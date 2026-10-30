import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { z } from "zod";
import {
  mailMessages,
  mailTracking,
  mailConnections,
  settings,
} from "@/db/schema";
import { providers } from "@/services/mail/providers";
import { loadMailContext, type MailContext } from "./context";
import { matchMail } from "./matching";
import {
  coverageKey,
  scanKey,
  retainDisposition,
  type ScanProgress,
} from "./scan-service";
import { mailAttention, mailDateGroup } from "./attention";
import type {
  MailWorkspaceData,
  WorkspaceQuery,
  MailRow,
} from "./workspace-data";

/** Rules may reclassify history, but can never make a previously seen message new. */
export async function reconcileLegacyMail(context: MailContext) {
  const policyKey = "mailPolicy:2026-10-30.4";
  const [policy] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, policyKey));
  // JSON imports and older links retain their exact message IDs. Imports are
  // historical discoveries, never evidence of a newly arrived provider email.
  const missing = await db
    .select({ message: mailMessages })
    .from(mailMessages)
    .leftJoin(mailTracking, eq(mailTracking.messageId, mailMessages.id))
    .where(sql`${mailTracking.id} IS NULL`);
  for (const { message } of missing)
    await db
      .insert(mailTracking)
      .values({
        provider: message.provider,
        accountEmail: message.accountEmail ?? "",
        providerMessageId: `legacy:${message.externalId}`,
        internetMessageId:
          message.provider === "OUTLOOK" ? message.externalId : null,
        messageId: message.id,
        threadId: message.threadId,
        sender: message.sender,
        senderName: message.senderName,
        subject: message.subject,
        receivedAt: message.receivedAt,
        disposition: "history",
        folders: message.provider === "IMPORT" ? ["JSON import"] : [],
        reason: "Imported before the mail workspace; kept as history",
        createdAt: message.createdAt,
      })
      .onConflictDoNothing({
        target: [
          mailTracking.provider,
          mailTracking.accountEmail,
          mailTracking.providerMessageId,
        ],
      });
  const rows = await db
    .select({ tracking: mailTracking, message: mailMessages })
    .from(mailTracking)
    .innerJoin(mailMessages, eq(mailTracking.messageId, mailMessages.id))
    .where(
      policy
        ? sql`${mailTracking.providerMessageId} LIKE 'legacy:%' AND ${mailTracking.reason} = 'Imported before the mail workspace; kept as history'`
        : undefined,
    );
  for (const { tracking, message } of rows) {
    const decision = matchMail(
      {
        ...message,
        externalId: tracking.providerMessageId,
        threadId: message.threadId ?? undefined,
        folders: tracking.folders,
        receivedAt: message.receivedAt.toISOString(),
        bodyText: message.bodyText ?? "",
      },
      context,
      { historical: true, seen: true },
    );
    const linked = context.applications.find(
      (app) => app.id === message.linkedApplicationId,
    );
    await db
      .update(mailTracking)
      .set({
        disposition: linked ? "history" : retainDisposition(tracking, decision),
        companyKeys: linked ? [linked.company] : decision.companyKeys,
        applicationIds: linked ? [linked.id] : decision.applicationIds,
        evidence: decision.evidence,
        reason: linked
          ? "Previously linked to this application; preserved in history"
          : decision.reason,
        updatedAt: new Date(),
      })
      .where(eq(mailTracking.id, tracking.id));
  }
  if (!policy)
    await db
      .insert(settings)
      .values({
        key: policyKey,
        value: { checkedAt: new Date().toISOString() },
      })
      .onConflictDoNothing();
}

const kindLabels: Record<string, string> = {
  INTERVIEW: "Interview",
  ASSESSMENT: "Assessment",
  OFFER: "Offer",
  REJECTION: "Application outcome",
  FOLLOW_UP: "Application update",
  RECRUITER_OUTREACH: "Hiring conversation",
  APPLICATION_ACKNOWLEDGEMENT: "Application received",
  UNKNOWN: "Message",
};
export async function readMailWorkspace(
  query: WorkspaceQuery,
): Promise<MailWorkspaceData> {
  const context = await loadMailContext();
  await reconcileLegacyMail(context);
  const connections = await db
    .select({
      id: mailConnections.id,
      provider: mailConnections.provider,
      email: mailConnections.email,
      lastChecked: mailConnections.lastRefreshedAt,
      lastError: mailConnections.lastError,
    })
    .from(mailConnections)
    .orderBy(mailConnections.createdAt);
  const conditions = [];
  if (query.application)
    conditions.push(
      or(
        eq(mailMessages.linkedApplicationId, query.application),
        and(
          isNull(mailMessages.linkedApplicationId),
          sql`${mailTracking.applicationIds} @> ${JSON.stringify([query.application])}::jsonb`,
        ),
      )!,
    );
  else if (query.company) {
    const ids = context.applications
      .filter((app) => app.company === query.company)
      .map((app) => app.id);
    conditions.push(
      or(
        ...(ids.length ? [inArray(mailMessages.linkedApplicationId, ids)] : []),
        and(
          isNull(mailMessages.linkedApplicationId),
          sql`${mailTracking.companyKeys} @> ${JSON.stringify([query.company])}::jsonb`,
        ),
      )!,
    );
  }
  if (query.account)
    conditions.push(eq(mailTracking.accountEmail, query.account));
  if (query.q?.trim()) {
    const term = `%${query.q
      .trim()
      .slice(0, 200)
      .replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(mailTracking.subject, term),
        ilike(mailTracking.sender, term),
        ilike(mailTracking.senderName, term),
        ilike(mailMessages.bodyText, term),
      )!,
    );
  }
  const disposition = sql<string>`CASE WHEN ${mailTracking.disposition} = 'excluded' THEN 'excluded' WHEN ${mailMessages.attentionState} = 'DONE' OR ${mailMessages.linkedApplicationId} IS NOT NULL THEN 'history' ELSE ${mailTracking.disposition} END`;
  const scope = and(...conditions);
  const totals = await db
    .select({ disposition, count: sql<number>`count(*)::int` })
    .from(mailTracking)
    .leftJoin(mailMessages, eq(mailTracking.messageId, mailMessages.id))
    .where(scope)
    .groupBy(disposition);
  const counts = { latest: 0, history: 0, excluded: 0 };
  for (const row of totals)
    if (row.disposition in counts)
      counts[row.disposition as keyof typeof counts] = row.count;
  const view =
    query.view === "history" || query.view === "excluded"
      ? query.view
      : "latest";
  const paging =
    query.before && /^[\dTZ:.+-]+\|[\da-f-]{36}$/i.test(query.before)
      ? query.before.split("|")
      : null;
  if (
    paging &&
    Number.isFinite(Date.parse(paging[0])) &&
    z.uuid().safeParse(paging[1]).success
  )
    conditions.push(
      sql`(${mailTracking.receivedAt}, ${mailTracking.id}) < (${new Date(paging[0])}, ${paging[1]}::uuid)`,
    );
  const rows = await db
    .select({ tracking: mailTracking, message: mailMessages })
    .from(mailTracking)
    .leftJoin(mailMessages, eq(mailTracking.messageId, mailMessages.id))
    .where(and(...conditions, sql`${disposition} = ${view}`))
    .orderBy(desc(mailTracking.receivedAt), desc(mailTracking.id))
    .limit(101);
  const more = rows.length > 100;
  const selectedRows = rows.slice(0, 100);
  const messages: MailRow[] = selectedRows.map(({ tracking, message }) => {
    const appIds = message?.linkedApplicationId
      ? [message.linkedApplicationId]
      : tracking.applicationIds;
    const application =
      appIds.length === 1
        ? context.applications.find((app) => app.id === appIds[0])
        : null;
    const companyKeys =
      message?.linkedApplicationId && application
        ? [application.company]
        : tracking.companyKeys;
    const kind = message?.classification ?? "UNKNOWN";
    const attention = message ? mailAttention(message) : null;
    return {
      id: tracking.id,
      company: companyKeys[0] ?? "",
      application: application?.id ?? null,
      account: tracking.accountEmail,
      accountEmail: tracking.accountEmail,
      provider: tracking.provider,
      name: tracking.senderName || tracking.sender,
      sender: tracking.sender,
      subject: tracking.subject,
      bodyText:
        view === "excluded"
          ? "Message content was not retained for this excluded result. The provider copy is unchanged."
          : (message?.bodyText ?? message?.snippet ?? ""),
      receivedAt: tracking.receivedAt.toISOString(),
      firstTrackedAt: tracking.createdAt.toISOString(),
      time: new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(tracking.receivedAt),
      group: mailDateGroup(tracking.receivedAt),
      kind: kindLabels[kind],
      action:
        attention?.reason ??
        (view === "excluded"
          ? "Excluded from your application queue"
          : "Review this message; application outcomes are recorded separately"),
      sourceFolder: tracking.folders.join(", ") || "Folder not recorded",
      folders: tracking.folders,
      decision: {
        destination: view,
        reason: tracking.reason,
        evidence: tracking.evidence,
      },
      companyKeys,
      applicationIds: appIds,
      messageId: tracking.messageId,
    };
  });
  const stored = await db
    .select()
    .from(settings)
    .where(
      sql`${settings.key} LIKE 'mailCoverage:%' OR ${settings.key} LIKE 'mailScan:v2:%'`,
    );
  const coverage = connections.map((account) => {
    const value = stored.find(
      (row) => row.key === coverageKey(account.id),
    )?.value;
    return {
      account: account.email,
      checkedAt: typeof value?.checkedAt === "string" ? value.checkedAt : null,
      folders: Array.isArray(value?.folders)
        ? (value.folders as ScanProgress["folders"])
        : [],
    };
  });
  const scans = connections.flatMap((account) =>
    ["latest", "history"].flatMap((mode) => {
      const value = stored.find(
        (row) => row.key === scanKey(account.id, mode, query),
      )?.value as ScanProgress | undefined;
      return value
        ? [
            {
              account: account.email,
              mode,
              scanned: value.scanned,
              matched: value.matched,
              complete: value.complete,
              checkedAt: value.checkedAt,
            },
          ]
        : [];
    }),
  );
  const last = selectedRows.at(-1)?.tracking;
  return {
    companies: context.companies,
    applications: context.applications,
    messages,
    counts,
    total: counts[view],
    nextBefore:
      more && last ? `${last.receivedAt.toISOString()}|${last.id}` : null,
    baselineAt: context.baselineAt,
    connections: connections.map((row) => ({
      ...row,
      lastChecked: row.lastChecked?.toISOString() ?? null,
    })),
    configs: providers.map((provider) => {
      const { configured, missing } = provider.configuration();
      return {
        slug: provider.slug,
        label: provider.label,
        configured,
        missing,
      };
    }),
    coverage,
    scans,
  };
}
