import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mailConnections, mailMessages, mailTracking } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { providerFor } from "@/services/mail/providers";
import { withConnectionLock } from "@/services/mail/providers/connections";
import { assertPhrase } from "@/services/mail/providers/search-query";
import type { ProviderId } from "@/services/mail/providers/types";
import { isSharedSender, keywordProblem, loadMailContext } from "./context";
import { importMailRecords, mailImportSchema } from "./import";
import { readMailItem } from "./mail-list";
import type { MailItem } from "./mail-item";
import { storeCompanyRule } from "./rule-store";

/** A display name the panel can offer as a keyword, or null when it couldn't identify the company. */
function keywordFrom(senderName: string, keywords: string[]) {
  try {
    const name = assertPhrase(senderName);
    if (name.length < 3 || keywordProblem(name)) return null;
    return keywords.some((keyword) => keyword.toLowerCase() === name.toLowerCase()) ? null : name;
  } catch {
    return null;
  }
}

/**
 * Include this: keep a dropped email for a company, flip its ledger row to kept, and add its
 * sender to the company's addresses unless many companies share that sender. Then the panel
 * offers the sender's name as a keyword instead.
 */
export async function includeMail(
  trackingId: string,
  companyKey: string,
): Promise<{
  item: MailItem;
  addedSender: string | null;
  skippedShared: string | null;
  suggestedKeyword: string | null;
}> {
  const [row] = z.uuid().safeParse(trackingId).success
    ? await db.select().from(mailTracking).where(eq(mailTracking.id, trackingId))
    : [];
  if (!row) throw new ApiError("Email not found.", 404);
  if (row.disposition === "kept") throw new ApiError("This email is already kept.", 409);
  const context = await loadMailContext();
  const company = context.companies.find((entry) => entry.id === companyKey);
  if (!company) throw new ApiError("Company not found.", 404);
  const [connection] = await db
    .select()
    .from(mailConnections)
    .where(
      and(eq(mailConnections.provider, row.provider), eq(mailConnections.email, row.accountEmail)),
    );
  if (!connection) throw new ApiError(`Reconnect ${row.accountEmail} to include this email.`, 409);

  const messageId = await withConnectionLock(connection.id, async (database, current) => {
    const provider = providerFor(current.provider);
    const raw = await provider.fetchMessage(
      current,
      row.providerMessageId.replace(/^legacy:/, ""),
      await provider.folders(current),
    );
    if (!raw) throw new ApiError(`${current.email} no longer has this email.`, 404);
    const externalId = `${current.email}:${raw.externalId}`;
    const records = mailImportSchema.parse([
      {
        ...raw,
        externalId,
        subject: raw.subject.trim() || "(No subject)",
        senderName: (raw.senderName ?? "").slice(0, 500),
      },
    ]);
    return database.transaction(async (tx) => {
      const imported = await importMailRecords(
        records,
        provider.id as ProviderId,
        current.email,
        tx,
      );
      const [message] = await tx
        .select({ id: mailMessages.id })
        .from(mailMessages)
        .where(
          and(eq(mailMessages.provider, provider.id), eq(mailMessages.externalId, externalId)),
        );
      // Whether it was history was decided when the fetch or search saw it; the inbox's
      // last fetch has moved on since, so it can't decide that now.
      const recovered = row.recovered;
      await tx
        .update(mailMessages)
        .set({
          companyKey,
          folders: raw.folders,
          ...(imported.imported
            ? recovered
              ? { attentionState: "DONE" as const, processedAt: new Date() }
              : { attentionState: "OPEN" as const }
            : {}),
        })
        .where(eq(mailMessages.id, message.id));
      await tx
        .update(mailTracking)
        .set({
          disposition: "kept",
          messageId: message.id,
          companyKeys: [companyKey],
          reason: `Included by you for ${company.name}`,
          evidence: [...row.evidence, "Included by you"],
          folders: raw.folders,
          updatedAt: new Date(),
        })
        .where(eq(mailTracking.id, row.id));
      return message.id;
    });
  });

  const sender = row.sender.trim().toLowerCase();
  const { rule } = company;
  let addedSender: string | null = null;
  let skippedShared: string | null = null;
  let suggestedKeyword: string | null = null;
  if (isSharedSender(sender)) {
    skippedShared = sender;
    suggestedKeyword = keywordFrom(row.senderName, rule.keywords);
  } else if (
    z.email().safeParse(sender).success &&
    !rule.senders.some((known) => known.toLowerCase() === sender)
  ) {
    await storeCompanyRule(companyKey, {
      aliases: rule.aliases,
      domains: rule.domains,
      senders: [...rule.senders, sender],
      keywords: rule.keywords,
      excludedTerms: rule.excludedTerms,
    });
    addedSender = sender;
  }
  return { item: await readMailItem(messageId), addedSender, skippedShared, suggestedKeyword };
}
