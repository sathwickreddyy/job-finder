import { createHash } from "node:crypto";
import { db } from "@/db";
import { activityLogs, applications, jobs, mailEvents, mailMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { classifyMail } from "@/services/mail/classifier";
export const mailImportSchema = z
  .array(
    z.object({
      externalId: z.string().min(1).max(1000).optional(),
      threadId: z.string().max(1000).optional(),
      sender: z.string().trim().min(1).max(1000),
      senderName: z.string().max(500).default(""),
      recipient: z.string().max(1000).default(""),
      subject: z.string().trim().min(1).max(2000),
      snippet: z.string().max(2000).default(""),
      bodyText: z.string().max(100000).default(""),
      receivedAt: z
        .string()
        .refine((v) => !Number.isNaN(Date.parse(v)), "Enter an ISO received date")
        .transform((v) => new Date(v)),
    }),
  )
  .min(1)
  .max(200);
export type MailImportRecords = z.infer<typeof mailImportSchema>;
export async function importMailRecords(records: MailImportRecords, provider: "IMPORT" | "GMAIL") {
  return db.transaction(async (tx) => {
    let imported = 0;
    let duplicates = 0;
    const applicationOptions = await tx
      .select({ id: applications.id, company: jobs.company })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id));
    for (const record of records) {
      const externalId =
        record.externalId ??
        createHash("sha256")
          .update(
            JSON.stringify([
              record.sender,
              record.subject,
              record.receivedAt.toISOString(),
              record.bodyText,
            ]),
          )
          .digest("hex");
      const classification = classifyMail(record);
      const [message] = await tx
        .insert(mailMessages)
        .values({ ...record, externalId, provider, classification: classification.type })
        .onConflictDoNothing({ target: [mailMessages.provider, mailMessages.externalId] })
        .returning();
      if (!message) {
        duplicates++;
        continue;
      }
      const searchable = `${record.subject}\n${record.bodyText}\n${record.sender}`.toLowerCase();
      const suggestions = applicationOptions.filter(
        (application) =>
          application.company.length >= 4 && searchable.includes(application.company.toLowerCase()),
      );
      await tx.insert(mailEvents).values({
        mailMessageId: message.id,
        type: classification.type,
        confidence: classification.confidence,
        status: "NEEDS_REVIEW",
        details: {
          reasons: classification.reasons,
          ...(suggestions.length === 1 ? { suggestedApplicationId: suggestions[0].id } : {}),
          manualReviewRequired: true,
        },
      });
      imported++;
    }
    await tx.insert(activityLogs).values({
      action: "MAIL_IMPORTED",
      entityType: "MAIL",
      summary: `${imported} recruiting messages imported; ${duplicates} duplicates skipped`,
      metadata: { provider, imported, duplicates },
    });
    return { imported, duplicates };
  });
}
