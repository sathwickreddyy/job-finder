import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../src/db";
import { activityLogs, jobs, mailEvents, mailMessages, settings } from "../../../src/db/schema";

const mailIds: string[] = [];
const jobIds: string[] = [];
export async function guardMailFixtures() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Mail fixtures require jobops_e2e.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Mail fixtures require the ownership marker.");
}
export async function seedMail(input: {
  subject: string;
  sender?: string;
  classification: typeof mailMessages.$inferInsert.classification;
  recordId?: string;
  attentionState?: "OPEN" | "DONE";
}) {
  await guardMailFixtures();
  const id = randomUUID();
  mailIds.push(id);
  const [message] = await db
    .insert(mailMessages)
    .values({
      id,
      externalId: id,
      sender: input.sender ?? "talent@example.invalid",
      senderName: "Talent Team",
      subject: input.subject,
      snippet: `${input.subject} details`,
      bodyText: `${input.subject} full message`,
      receivedAt: new Date(),
      classification: input.classification,
      attentionState: input.attentionState ?? "OPEN",
    })
    .returning();
  await guardMailFixtures();
  await db.insert(mailEvents).values({
    mailMessageId: message.id,
    type: message.classification,
    confidence: 0.9,
    details: input.recordId ? { suggestedApplicationId: input.recordId } : {},
  });
  return message.id;
}
export async function captureImportedMail(externalId: string) {
  await guardMailFixtures();
  const [message] = await db
    .select()
    .from(mailMessages)
    .where(eq(mailMessages.externalId, externalId));
  if (message && !mailIds.includes(message.id)) mailIds.push(message.id);
  return message;
}
export async function captureSavedJob(id: string) {
  await guardMailFixtures();
  jobIds.push(id);
}
export async function cleanupMailFixtures() {
  await guardMailFixtures();
  if (mailIds.length) {
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, mailIds));
    await db.delete(mailMessages).where(inArray(mailMessages.id, mailIds));
  }
  if (jobIds.length) {
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, jobIds));
    await db.delete(jobs).where(inArray(jobs.id, jobIds));
  }
  mailIds.length = 0;
  jobIds.length = 0;
}
