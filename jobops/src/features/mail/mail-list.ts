import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mailMessages } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import type { MailFacts } from "@/features/timeline/index-rows";
import { mailCursor } from "@/features/timeline/query";
import { loadMailContext, type MailContext } from "./context";
import { mailLookup, toMailItem, type MailItem } from "./mail-item";
import { classificationsFor, kindLabel, parseTagParam, type MailTag } from "./tags";

const pageSize = 50;
export const mailListSchema = z.object({
  attention: z.enum(["open", "all"]).default("all"),
  /** A tag id, or a legacy id from an older link that covers several tags. */
  tag: z
    .string()
    .refine((value) => parseTagParam(value) !== null, "Unknown tag.")
    .optional(),
  company: z.string().trim().min(1).max(300).optional(),
  application: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
  cursor: mailCursor.optional(),
});

// Correlated subqueries name the outer table explicitly: Drizzle leaves select-list
// columns unqualified, which would bind "id" to the inner table instead.
/** Excluded identities never surface, even when an older import kept a copy. */
export const notExcluded = sql`NOT EXISTS (SELECT 1 FROM mail_tracking t WHERE t.message_id = "mail_messages"."id" AND t.disposition = 'excluded')`;
const outcome = sql<
  string | null
>`(SELECT e.payload->>'outcome' FROM application_events e WHERE e.payload->>'mailMessageId' = "mail_messages"."id"::text AND e.payload->>'outcome' IS NOT NULL ORDER BY e.created_at DESC LIMIT 1)`;
/** True once the user undid an outcome the mail rule recorded from it. */
const autoUndone = sql<boolean>`EXISTS (SELECT 1 FROM mail_events me WHERE me.mail_message_id = "mail_messages"."id" AND me.details->>'autoUndone' = 'true')`;
/** The inbox of the earlier copy this email follows, when the mail rule settled it as a copy. */
const copyOf = sql<
  string | null
>`(SELECT coalesce(c.account_email, '') FROM mail_events me JOIN mail_messages c ON c.id::text = me.details->>'copyOf' WHERE me.mail_message_id = "mail_messages"."id" LIMIT 1)`;
/** Null unless the mail rule recorded an outcome from it; true while nothing newer was recorded. */
const autoUndoable = sql<
  boolean | null
>`(SELECT NOT EXISTS (SELECT 1 FROM application_events n WHERE n.application_id = e.application_id AND n.id <> e.id AND n.created_at > e.created_at AND n.payload ? 'outcome') FROM application_events e WHERE e.payload->>'mailMessageId' = "mail_messages"."id"::text AND e.payload->>'auto' = 'true' AND e.payload ? 'outcome' ORDER BY e.created_at DESC LIMIT 1)`;

/** The rows a list query covers before attention and paging; the rail counts with it too. */
export function mailScope(query: z.output<typeof mailListSchema>, context: MailContext): SQL[] {
  const scope: SQL[] = [notExcluded];
  const tags = query.tag ? parseTagParam(query.tag) : null;
  if (tags) scope.push(inArray(mailMessages.classification, tags.flatMap(classificationsFor)));
  if (query.application) scope.push(eq(mailMessages.linkedApplicationId, query.application));
  if (query.company) {
    const ids = context.applications
      .filter((app) => app.company === query.company)
      .map((app) => app.id);
    scope.push(
      or(
        eq(mailMessages.companyKey, query.company),
        ...(ids.length ? [inArray(mailMessages.linkedApplicationId, ids)] : []),
      )!,
    );
  }
  if (query.q) {
    const term = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    scope.push(
      or(
        ilike(mailMessages.subject, term),
        ilike(mailMessages.sender, term),
        ilike(mailMessages.senderName, term),
        ilike(mailMessages.bodyText, term),
        ilike(mailMessages.snippet, term),
      )!,
    );
  }
  return scope;
}

export async function listMail(
  filters: z.input<typeof mailListSchema>,
  loaded?: MailContext,
  /** Extra conditions for in-app views, such as Needs a home. */
  extra: SQL[] = [],
): Promise<{ items: MailItem[]; nextCursor: string | null; openCount: number }> {
  const query = mailListSchema.parse(filters);
  const context = loaded ?? (await loadMailContext());
  const scope = [...mailScope(query, context), ...extra];
  const open = ne(mailMessages.attentionState, "DONE");
  const page = [...scope, ...(query.attention === "open" ? [open] : [])];
  if (query.cursor) {
    const [at, id] = query.cursor.split("|");
    page.push(
      sql`(${mailMessages.receivedAt}, ${mailMessages.id}) < (${new Date(at)}, ${id}::uuid)`,
    );
  }
  const [rows, [counted]] = await Promise.all([
    db
      .select({ message: mailMessages, outcome, autoUndoable, autoUndone, copyOf })
      .from(mailMessages)
      .where(and(...page))
      .orderBy(desc(mailMessages.receivedAt), desc(mailMessages.id))
      .limit(pageSize + 1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mailMessages)
      .where(and(...scope, open)),
  ]);
  const lookup = mailLookup(context);
  const items = rows
    .slice(0, pageSize)
    .map(({ message, outcome, autoUndoable, autoUndone, copyOf }) =>
      toMailItem({ ...message, outcome, autoUndoable, autoUndone, copyOf }, lookup),
    );
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > pageSize && last ? `${last.receivedAt}|${last.id}` : null,
    openCount: counted?.count ?? 0,
  };
}

/** One visible email in the shared shape; excluded or missing mail is a 404. */
export async function readMailItem(id: string, context?: MailContext): Promise<MailItem> {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select({ message: mailMessages, outcome, autoUndoable, autoUndone, copyOf })
        .from(mailMessages)
        .where(and(eq(mailMessages.id, id), notExcluded))
    : [];
  if (!row) throw new ApiError("Email not found.", 404);
  return toMailItem(
    {
      ...row.message,
      outcome: row.outcome,
      autoUndoable: row.autoUndoable,
      autoUndone: row.autoUndone,
      copyOf: row.copyOf,
    },
    mailLookup(context ?? (await loadMailContext())),
  );
}

/**
 * Open and total counts per company over visible mail. A linked email belongs to its
 * application's company, otherwise to its own `company_key`; null is Needs a home. With a
 * tag or search, `matches` counts the rows `listMail` would return for that filter.
 */
export async function mailFacts(
  context: MailContext,
  keyOf: (applicationId: string) => string | undefined,
  filters: { tag?: MailTag; q?: string },
): Promise<{ facts: MailFacts[]; matches: Map<string | null, number> | null }> {
  const filtered = Boolean(filters.tag || filters.q);
  const scope = filtered ? mailScope(mailListSchema.parse(filters), context) : [];
  const rows = await db
    .select({
      companyKey: mailMessages.companyKey,
      applicationId: mailMessages.linkedApplicationId,
      attentionState: mailMessages.attentionState,
      classification: mailMessages.classification,
      receivedAt: mailMessages.receivedAt,
      matched: filtered ? sql<boolean>`(${and(...scope)})` : sql<boolean>`true`,
    })
    .from(mailMessages)
    .where(notExcluded)
    .orderBy(desc(mailMessages.receivedAt));
  const byKey = new Map<string | null, MailFacts>();
  const matches = filtered ? new Map<string | null, number>() : null;
  for (const row of rows) {
    const key = (row.applicationId && keyOf(row.applicationId)) || row.companyKey || null;
    const open = row.attentionState !== "DONE";
    const facts = byKey.get(key) ?? {
      key,
      open: 0,
      total: 0,
      latestAt: row.receivedAt.toISOString(),
      latestOpenKind: null,
    };
    facts.total++;
    if (open) {
      facts.open++;
      facts.latestOpenKind ??= kindLabel[row.classification];
    }
    byKey.set(key, facts);
    if (matches && row.matched) matches.set(key, (matches.get(key) ?? 0) + 1);
  }
  return { facts: [...byKey.values()], matches };
}
