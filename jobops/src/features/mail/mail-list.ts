import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mailMessages } from "@/db/schema";
import { loadMailContext } from "./context";
import { mailLookup, toMailItem, type MailItem } from "./mail-item";
import { classificationsFor, mailTags } from "./tags";

const pageSize = 50;
export const mailListSchema = z.object({
  attention: z.enum(["open", "all"]).default("all"),
  tag: z.enum(mailTags).optional(),
  company: z.string().trim().min(1).max(300).optional(),
  application: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\|[0-9a-f-]{36}$/i)
    .refine((value) => Number.isFinite(Date.parse(value.split("|")[0])))
    .optional(),
});

// Correlated subqueries name the outer table explicitly: Drizzle leaves select-list
// columns unqualified, which would bind "id" to the inner table instead.
/** Excluded identities never surface, even when an older import kept a copy. */
export const notExcluded = sql`NOT EXISTS (SELECT 1 FROM mail_tracking t WHERE t.message_id = "mail_messages"."id" AND t.disposition = 'excluded')`;
const outcome = sql<
  string | null
>`(SELECT e.payload->>'outcome' FROM application_events e WHERE e.payload->>'mailMessageId' = "mail_messages"."id"::text AND e.payload->>'outcome' IS NOT NULL ORDER BY e.created_at DESC LIMIT 1)`;

export async function listMail(
  filters: z.input<typeof mailListSchema>,
): Promise<{ items: MailItem[]; nextCursor: string | null; openCount: number }> {
  const query = mailListSchema.parse(filters);
  const context = await loadMailContext();
  const scope: SQL[] = [notExcluded];
  if (query.tag) scope.push(inArray(mailMessages.classification, classificationsFor(query.tag)));
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
      .select({ message: mailMessages, outcome })
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
    .map(({ message, outcome }) => toMailItem({ ...message, outcome }, lookup));
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > pageSize && last ? `${last.receivedAt}|${last.id}` : null,
    openCount: counted?.count ?? 0,
  };
}
