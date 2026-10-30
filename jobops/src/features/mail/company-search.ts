import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  companyMailMatches,
  mailConnections,
  mailMessages,
  mailTracking,
  mailEvents,
  settings,
} from "@/db/schema";
import { withConnectionLock } from "@/services/mail/providers/connections";
import { providerFor } from "@/services/mail/providers";
import { encryptToken, decryptToken } from "@/services/mail/crypto";
import { classifyMail } from "@/services/mail/classifier";
import { currentMessageText } from "@/services/mail/providers/plain-text";
import { gmailSearchQuery, outlookSearchQuery } from "@/services/mail/providers/search-query";
import type { MailConnection, ScannedMessage } from "@/services/mail/providers/types";
import { loadMailContext, type MailContext, type WorkspaceCompany } from "./context";
import { matchMail } from "./matching";
import { importMailRecords, mailImportSchema } from "./import";
import { mailSearchSchema, resolveMailSearch, type ResolvedMailSearch } from "./search-contract";
import { MailSearchError } from "./search-service";
import {
  companyIdentity,
  companyProgressKey,
  companyRevision,
  companyWindow,
  type CompanyProgress,
} from "./company-search-policy";
import type {
  CompanyTrackingInfo,
  SavedCompanyMail,
  SearchAccountPage,
  SearchMessage,
  SearchResponse,
} from "./search-state";

const startSchema = z
  .object({
    company: z.string().min(1).max(300),
    mode: z.enum(["latest", "history"]).default("latest"),
    accounts: mailSearchSchema.shape.accounts,
    since: mailSearchSchema.shape.since,
    until: mailSearchSchema.shape.until,
    lastDays: mailSearchSchema.shape.lastDays,
  })
  .strict();
const cursorSchema = z.object({
  purpose: z.literal("company-mail-v1"),
  expires: z.number(),
  company: z.string(),
  mode: z.enum(["latest", "history"]),
  revision: z.string(),
  query: mailSearchSchema,
  runs: z
    .array(z.object({ id: z.uuid(), runId: z.uuid().optional() }))
    .min(1)
    .max(10),
});
export const companySearchRequestSchema = z.union([
  startSchema,
  z.object({ companyCursor: z.string().min(1).max(64000) }).strict(),
]);
export async function searchCompanyMail(input: unknown): Promise<SearchResponse> {
  const parsed = companySearchRequestSchema.parse(input);
  const context = await loadMailContext();
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if ("companyCursor" in parsed) {
    try {
      cursor = cursorSchema.parse(JSON.parse(decryptToken(parsed.companyCursor)));
    } catch {
      throw new MailSearchError("Invalid company search cursor. Start a company check again.");
    }
    if (cursor.expires <= Date.now())
      throw new MailSearchError(
        "Company search cursor expired. Start a check to resume saved progress.",
      );
  }
  const company = context.companies.find(
    (c) => c.id === (cursor?.company ?? ("company" in parsed ? parsed.company : "")),
  );
  if (!company) throw new MailSearchError("Choose an existing company.");
  const revision = companyRevision(company, context);
  if (cursor && cursor.revision !== revision)
    throw new MailSearchError(
      "Company rules changed. Start a new check; saved mail is retained.",
      409,
    );
  const requested = cursor
    ? resolveMailSearch(cursor.query)
    : resolveMailSearch(
        mailSearchSchema.parse(
          "company" in parsed
            ? {
                accounts: parsed.accounts,
                since: parsed.since,
                until: parsed.until,
                lastDays: parsed.lastDays,
              }
            : {},
        ),
      );
  mailSearchSchema.parse(requested);
  // startSchema includes company/mode; validate only the common date/account fields.
  const mode = cursor?.mode ?? ("mode" in parsed ? parsed.mode : "latest");
  const connected = await db.select().from(mailConnections);
  const selected = connected.filter((c) =>
    cursor
      ? cursor.runs.some((r) => r.id === c.id)
      : !requested.accounts || requested.accounts.includes(c.email.toLowerCase()),
  );
  if (
    !selected.length ||
    selected.length > 10 ||
    requested.accounts?.some((email) => !selected.some((c) => c.email.toLowerCase() === email)) ||
    (cursor && selected.length !== cursor.runs.length)
  )
    throw new MailSearchError("Choose up to 10 currently connected accounts.");
  const results = await Promise.all(
    selected.map(async (connection) => {
      try {
        return await companyPage(
          connection,
          company,
          context,
          requested,
          mode,
          cursor?.runs.find((r) => r.id === connection.id)?.runId,
        );
      } catch (error) {
        if (error instanceof MailSearchError) throw error;
        return {
          accountId: connection.id,
          account: connection.email,
          provider: connection.provider as "GMAIL" | "OUTLOOK",
          fetched: 0,
          returned: 0,
          totalFetched: 0,
          skippedContext: 0,
          skippedOutsideWindow: 0,
          messages: [],
          complete: false,
          limited: false,
          effectiveQuery: null,
          error: "Company mail check interrupted. Retry; committed pages and saved mail are safe.",
          runId: cursor?.runs.find((r) => r.id === connection.id)?.runId,
        };
      }
    }),
  );
  const pending = results.filter((r) => !r.complete && !r.limited);
  const token = pending.length
    ? encryptToken(
        JSON.stringify({
          purpose: "company-mail-v1",
          expires: Date.now() + 86400000,
          company: company.id,
          mode,
          revision,
          query: requested,
          runs: pending.map((r) => ({ id: r.accountId, runId: r.runId })),
        }),
      )
    : null;
  return {
    query: requested,
    readOnly: false,
    savedCompany: company.id,
    window: {
      since: requested.since ?? null,
      until: requested.until,
      bounds: "since inclusive; until exclusive",
    },
    scope:
      "Company sender/subject rules across provider-accessible incoming folders, including spam/junk; saved permanently",
    accounts: results,
    complete: results.every((r) => r.complete),
    more: pending.length > 0,
    limited: results.some((r) => r.limited),
    nextCursor: token,
    warning: results.some((r) => r.limited)
      ? "Outlook search limit reached. Narrow the date window; saved matches are retained."
      : null,
  };
}

export async function companyPage(
  connection: MailConnection,
  company: WorkspaceCompany,
  context: MailContext,
  requested: ResolvedMailSearch,
  mode: "latest" | "history",
  expectedRun?: string,
): Promise<SearchAccountPage & { runId?: string }> {
  return withConnectionLock(connection.id, async (database, current) => {
    const key = companyProgressKey(company.id, current.id, mode);
    const revision = companyRevision(company, context);
    const [saved] = await database.select().from(settings).where(eq(settings.key, key));
    const prior = saved?.value as CompanyProgress | undefined;
    if (expectedRun && prior?.runId !== expectedRun)
      throw new MailSearchError(
        "A newer company check replaced this cursor. Start a check to resume current progress.",
        409,
      );
    const planned = companyWindow(prior, requested, revision);
    const progress: CompanyProgress = planned.resumed
      ? prior!
      : {
          runId: randomUUID(),
          revision,
          since: planned.since,
          until: planned.until,
          complete: false,
          limited: false,
          fetched: 0,
          pages: 0,
          coveredSince: planned.coveredSince,
          coveredUntil: planned.coveredUntil,
        };
    const info: CompanyTrackingInfo = {
      saved: 0,
      alreadyKnown: 0,
      excluded: 0,
      rejected: [],
      cacheHit: planned.cacheHit,
      resumed: planned.resumed,
      checkpointPages: progress.pages,
      window: { since: progress.since ?? null, until: progress.until },
    };
    const base: SearchAccountPage = {
      accountId: current.id,
      account: current.email,
      provider: current.provider as "GMAIL" | "OUTLOOK",
      fetched: 0,
      returned: 0,
      skippedContext: 0,
      skippedOutsideWindow: 0,
      messages: [],
      error: null,
      complete: false,
      limited: false,
      totalFetched: progress.fetched,
      effectiveQuery: null,
      tracking: info,
    };
    if (planned.cacheHit)
      return {
        ...base,
        complete: true,
        totalFetched: 0,
        tracking: { ...info, checkpointPages: 0 },
      };
    const observed = await database
      .select({ tracking: mailTracking, match: companyMailMatches })
      .from(companyMailMatches)
      .innerJoin(mailTracking, eq(companyMailMatches.trackingId, mailTracking.id))
      .where(
        and(
          eq(companyMailMatches.companyKey, company.id),
          eq(mailTracking.provider, current.provider),
          eq(mailTracking.accountEmail, current.email),
        ),
      );
    const knownIds = observed
      .filter((r) => r.match.ruleRevision === revision)
      .map((r) => r.tracking.providerMessageId);
    const request = {
      since: progress.since,
      until: progress.until,
      next: progress.next,
      search: {
        keywords: [],
        senders: [],
        subjects: company.rule.subjectTerms,
        companyIdentity: companyIdentity(company, context),
      },
      skipIds: knownIds,
      skipInternetIds: observed
        .filter((r) => r.match.ruleRevision === revision)
        .flatMap((r) => (r.tracking.internetMessageId ? [r.tracking.internetMessageId] : [])),
    };
    const provider = providerFor(current.provider);
    base.effectiveQuery =
      current.provider === "GMAIL"
        ? gmailSearchQuery(request)
        : (outlookSearchQuery(request) ?? null);
    const page = await provider.scanMail(current, request, await provider.folders(current));
    return database.transaction(async (tx) => {
      const allPrior = await tx
        .select()
        .from(mailTracking)
        .where(
          and(
            eq(mailTracking.provider, current.provider),
            eq(mailTracking.accountEmail, current.email),
          ),
        );
      info.alreadyKnown = page.skippedKnown ?? 0;
      info.unavailable = page.skippedUnavailable ?? 0;
      for (const raw of page.messages) {
        if (raw.contextOnly) {
          base.skippedContext++;
          continue;
        }
        const received = Date.parse(raw.receivedAt);
        if (
          received >= Date.parse(progress.until) ||
          (progress.since && received < Date.parse(progress.since))
        ) {
          base.skippedOutsideWindow++;
          continue;
        }
        const previous =
          allPrior.find(
            (r) =>
              r.providerMessageId === raw.externalId ||
              r.providerMessageId === `legacy:${raw.externalId}`,
          ) ??
          allPrior.find(
            (r) => raw.internetMessageId && r.internetMessageId === raw.internetMessageId,
          );
        const cached =
          previous &&
          observed.find((r) => r.tracking.id === previous.id && r.match.ruleRevision === revision);
        if (cached) {
          info.alreadyKnown++;
          await tx
            .update(mailTracking)
            .set({ providerMessageId: raw.externalId, folders: raw.folders, updatedAt: new Date() })
            .where(eq(mailTracking.id, previous!.id));
          continue;
        }
        const decision = matchMail(
          raw,
          { ...context, companies: [company] },
          {
            historical: mode === "history",
            seen: Boolean(previous),
            threadApplications: raw.threadId
              ? allPrior.filter((r) => r.threadId === raw.threadId).flatMap((r) => r.applicationIds)
              : [],
          },
        );
        const [priorMessage] = previous?.messageId
          ? await tx
              .select({ linked: mailMessages.linkedApplicationId })
              .from(mailMessages)
              .where(eq(mailMessages.id, previous.messageId))
          : [];
        const manual =
          priorMessage?.linked &&
          context.applications.some(
            (app) => app.id === priorMessage.linked && app.company === company.id,
          );
        const kept =
          Boolean(manual) ||
          (decision.disposition !== "excluded" && decision.companyKeys.includes(company.id));
        const reason = manual ? "Manually linked to this company's application" :
          !kept && decision.disposition !== "excluded"
            ? "No sender, subject, outreach or thread identity for this company"
            : decision.reason;
        let messageId = previous?.messageId ?? null;
        if (kept && !messageId) {
          const externalId = `${current.email}:${raw.externalId}`;
          await importMailRecords(
            mailImportSchema.parse([{ ...raw, externalId }]),
            current.provider as "GMAIL" | "OUTLOOK",
            current.email,
            tx,
          );
          const [message] = await tx
            .select({ id: mailMessages.id })
            .from(mailMessages)
            .where(
              and(
                eq(mailMessages.provider, current.provider),
                eq(mailMessages.externalId, externalId),
              ),
            );
          messageId = message.id;
          await tx
            .update(mailEvents)
            .set({
              details: {
                reasons: decision.evidence,
                manualReviewRequired: true,
                ...(decision.applicationIds.length === 1
                  ? { suggestedApplicationId: decision.applicationIds[0] }
                  : {}),
              },
            })
            .where(eq(mailEvents.mailMessageId, messageId));
        }
        const preserveGlobal =
          previous &&
          previous.disposition !== "excluded" &&
          (kept ||
            previous.companyKeys.some((key) => key !== company.id) ||
            Boolean(priorMessage?.linked));
        const values = {
          provider: current.provider,
          accountEmail: current.email,
          providerMessageId: raw.externalId,
          internetMessageId: raw.internetMessageId ?? previous?.internetMessageId ?? null,
          messageId,
          threadId: raw.threadId ?? null,
          sender: raw.sender,
          senderName: raw.senderName ?? "",
          subject: raw.subject,
          receivedAt: new Date(raw.receivedAt),
          folders: raw.folders,
          companyKeys: kept
            ? [...new Set([...(previous?.companyKeys ?? []), company.id])]
            : (previous?.companyKeys ?? []),
          applicationIds: kept
            ? [...new Set([...(previous?.applicationIds ?? []), ...decision.applicationIds])]
            : (previous?.applicationIds ?? []),
          disposition: preserveGlobal
            ? previous.disposition
            : kept
              ? decision.disposition
              : "excluded",
          reason: preserveGlobal ? previous.reason : reason,
          evidence: preserveGlobal ? previous.evidence : decision.evidence,
          updatedAt: new Date(),
        };
        const [tracking] = previous
          ? await tx
              .update(mailTracking)
              .set(values)
              .where(eq(mailTracking.id, previous.id))
              .returning()
          : await tx.insert(mailTracking).values(values).returning();
        await tx
          .insert(companyMailMatches)
          .values({
            companyKey: company.id,
            trackingId: tracking.id,
            kept,
            reason,
            evidence: decision.evidence,
            ruleRevision: revision,
          })
          .onConflictDoUpdate({
            target: [companyMailMatches.companyKey, companyMailMatches.trackingId],
            set: {
              kept,
              reason,
              evidence: decision.evidence,
              ruleRevision: revision,
              updatedAt: new Date(),
            },
          });
        if (kept) {
          info.saved++;
          base.messages.push(toResult(raw, current, { kept, reason, evidence: decision.evidence }));
        } else {
          info.excluded++;
          info.rejected.push({ subject: raw.subject, sender: raw.sender, reason });
        }
      }
      const fetched = page.fetched ?? page.messages.length;
      progress.fetched += fetched;
      progress.pages++;
      progress.next = page.next;
      progress.limited = current.provider === "OUTLOOK" && progress.fetched >= 1000;
      progress.complete = !page.next && !progress.limited;
      if (progress.complete) progress.coveredUntil = progress.until;
      await tx
        .insert(settings)
        .values({ key, value: progress })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: progress, updatedAt: new Date() },
        });
      return {
        ...base,
        runId: progress.runId,
        fetched,
        totalFetched: progress.fetched,
        returned: base.messages.length,
        complete: progress.complete && Date.parse(progress.until) >= Date.parse(requested.until),
        limited: progress.limited,
        tracking: { ...info, checkpointPages: progress.pages },
      };
    });
  });
}
function toResult(
  raw: ScannedMessage,
  connection: MailConnection,
  decision?: SearchMessage["decision"],
): SearchMessage {
  return {
    ...raw,
    account: connection.email,
    provider: connection.provider as "GMAIL" | "OUTLOOK",
    identity: `${connection.id}:${raw.externalId}`,
    classification: classifyMail({ ...raw, bodyText: currentMessageText(raw.bodyText ?? "") }),
    decision,
  };
}
export async function readCompanyMail(
  company: string,
  view: "kept" | "excluded" = "kept",
  before?: string,
): Promise<SavedCompanyMail> {
  const context = await loadMailContext();
  if (!context.companies.some((c) => c.id === company))
    throw new MailSearchError("Choose an existing company.");
  const selectedCompany = context.companies.find((row) => row.id === company)!;
  const revision = companyRevision(selectedCompany, context);
  const applicationIds = context.applications.filter((app) => app.company === company).map((app) => app.id);
  // Reuse already-stored content, including legacy company/application links, without fetching it again.
  const stored = await db.select({ tracking: mailTracking, message: mailMessages, match: companyMailMatches })
    .from(mailTracking).innerJoin(mailMessages, eq(mailTracking.messageId, mailMessages.id))
    .leftJoin(companyMailMatches, and(eq(companyMailMatches.trackingId, mailTracking.id), eq(companyMailMatches.companyKey, company)))
    .where(and(or(sql`${mailTracking.companyKeys} @> ${JSON.stringify([company])}::jsonb`,
      ...(applicationIds.length ? [inArray(mailMessages.linkedApplicationId, applicationIds)] : []),
      eq(companyMailMatches.companyKey, company)),
    or(isNull(companyMailMatches.id), ne(companyMailMatches.ruleRevision, revision))));
  for (const { tracking, message } of stored) {
    const decision = matchMail({ ...message, externalId: tracking.providerMessageId, folders: tracking.folders,
      bodyText: message.bodyText ?? message.snippet, receivedAt: tracking.receivedAt.toISOString(), threadId: tracking.threadId ?? undefined },
      { ...context, companies: [selectedCompany] }, { historical: true, seen: true,
        threadApplications: tracking.threadId ? tracking.applicationIds : [] });
    const manual = message.linkedApplicationId && applicationIds.includes(message.linkedApplicationId);
    const values = { kept: Boolean(manual) || (decision.disposition !== "excluded" && decision.companyKeys.includes(company)),
      reason: manual ? "Manually linked to this company's application" : decision.reason,
      evidence: decision.evidence, ruleRevision: revision, updatedAt: new Date() };
    await db.insert(companyMailMatches).values({ ...values, companyKey: company, trackingId: tracking.id })
      .onConflictDoUpdate({ target: [companyMailMatches.companyKey, companyMailMatches.trackingId], set: values });
  }
  const connections = await db
    .select({
      id: mailConnections.id,
      email: mailConnections.email,
      provider: mailConnections.provider,
    })
    .from(mailConnections);
  const totals = await db
    .select({ kept: companyMailMatches.kept, count: sql<number>`count(*)::int` })
    .from(companyMailMatches)
    .where(eq(companyMailMatches.companyKey, company))
    .groupBy(companyMailMatches.kept);
  const counts = { kept: 0, excluded: 0 };
  totals.forEach((r) => {
    counts[r.kept ? "kept" : "excluded"] = r.count;
  });
  let paging;
  if (before) {
    const [at, id] = before.split("|");
    if (!z.iso.datetime().safeParse(at).success || !z.uuid().safeParse(id).success)
      throw new MailSearchError("Invalid saved-mail page.");
    paging = sql`(${mailTracking.receivedAt}, ${mailTracking.id}) < (${new Date(at)}, ${id}::uuid)`;
  }
  const rows = await db
    .select({ match: companyMailMatches, tracking: mailTracking, message: mailMessages })
    .from(companyMailMatches)
    .innerJoin(mailTracking, eq(companyMailMatches.trackingId, mailTracking.id))
    .leftJoin(mailMessages, eq(mailTracking.messageId, mailMessages.id))
    .where(
      and(
        eq(companyMailMatches.companyKey, company),
        eq(companyMailMatches.kept, view === "kept"),
        paging,
      ),
    )
    .orderBy(desc(mailTracking.receivedAt), desc(mailTracking.id))
    .limit(51);
  const messages: SearchMessage[] = rows.slice(0, 50).map(({ match, tracking, message }) => {
    const account = connections.find(
      (c) => c.email === tracking.accountEmail && c.provider === tracking.provider,
    );
    return toResult(
      {
        externalId: tracking.providerMessageId,
        sender: tracking.sender,
        senderName: tracking.senderName,
        subject: tracking.subject,
        bodyText: match.kept
          ? (message?.bodyText ?? message?.snippet ?? "")
          : "Excluded message: only identity, sender, subject, folder and decision were retained. The provider copy is unchanged.",
        receivedAt: tracking.receivedAt.toISOString(),
        folders: tracking.folders,
        threadId: tracking.threadId ?? undefined,
        internetMessageId: tracking.internetMessageId ?? undefined,
        recipient: message?.recipient ?? "",
      },
      {
        id: account?.id ?? `disconnected:${tracking.provider}:${tracking.accountEmail}`,
        email: tracking.accountEmail,
        provider: tracking.provider,
      } as MailConnection,
      { kept: match.kept, reason: match.reason, evidence: match.evidence },
    );
  });
  const last = rows[49]?.tracking;
  return {
    messages,
    counts,
    nextBefore: rows.length > 50 && last ? `${last.receivedAt.toISOString()}|${last.id}` : null,
  };
}
