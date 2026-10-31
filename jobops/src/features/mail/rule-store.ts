import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mailMessages, settings } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import type { CompanyMailRule } from "./company-rules";
import { companyRuleSchema, loadMailContext, ruleKey } from "./context";
import { notExcluded } from "./mail-list";
import { matchMail } from "./matching";

/**
 * Validate and save a company's rule, then place kept, unlinked, unplaced mail the new rule
 * matches. Attention never changes and kept mail is never hidden. A refused keyword is a 400
 * that names the company.
 */
export async function storeCompanyRule(
  key: string,
  input: unknown,
): Promise<{ rule: CompanyMailRule; placed: number; company: string }> {
  const context = await loadMailContext();
  const company = context.companies.find((row) => row.id === key);
  if (!company) throw new ApiError("Company not found.", 404);
  const parsed = companyRuleSchema(company.name).safeParse(input);
  if (!parsed.success) throw new ApiError(parsed.error.issues[0].message, 400);
  const value = { rule: parsed.data, revisedAt: new Date().toISOString() };
  await db
    .insert(settings)
    .values({ key: ruleKey(key), value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  const rule = { company: company.name, ...parsed.data };
  const scoped = { ...context, companies: [{ ...company, rule }] };
  const unplaced = await db
    .select()
    .from(mailMessages)
    .where(
      and(isNull(mailMessages.companyKey), isNull(mailMessages.linkedApplicationId), notExcluded),
    );
  let placed = 0;
  for (const message of unplaced) {
    const decision = matchMail(
      {
        ...message,
        externalId: message.externalId,
        threadId: message.threadId ?? undefined,
        folders: message.folders,
        bodyText: message.bodyText ?? "",
        receivedAt: message.receivedAt.toISOString(),
      },
      scoped,
      { historical: true, seen: true },
    );
    // Dropped decisions name the company they nearly matched; only kept ones place mail.
    if (
      decision.disposition === "excluded" ||
      decision.companyKeys.length !== 1 ||
      decision.companyKeys[0] !== key
    )
      continue;
    await db.update(mailMessages).set({ companyKey: key }).where(eq(mailMessages.id, message.id));
    placed++;
  }
  return { rule, placed, company: company.name };
}
