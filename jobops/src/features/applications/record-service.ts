import { eq } from "drizzle-orm";
import type { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  jobs,
  mailMessages,
  resumeVersions,
} from "@/db/schema";
import { methodNames, recordIntent, type recordMethods } from "./domain";
import { canEditPlannedRecord, recordStateFrom } from "./phase";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A record that is still only planned can be upgraded to sent; anything sent or closed cannot. */
export async function isPlannedRecord(tx: Tx, previous: typeof applications.$inferSelect) {
  const history = await tx
    .select({
      eventType: applicationEvents.eventType,
      occurredAt: applicationEvents.occurredAt,
    })
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, previous.id));
  const linkedMail = await tx
    .select({
      classification: mailMessages.classification,
      receivedAt: mailMessages.receivedAt,
      attentionState: mailMessages.attentionState,
    })
    .from(mailMessages)
    .where(eq(mailMessages.linkedApplicationId, previous.id));
  return canEditPlannedRecord(
    recordStateFrom({ ...previous, events: history, linkedMail }, [], []),
  );
}

/** Record as sent (or planned): shared by the Record form and the agent record API. */
export async function recordApplication(
  tx: Tx,
  input: {
    recordId: string | null;
    jobId: string;
    versionId: string | null;
    method: (typeof recordMethods)[number];
    state: "planned" | "sent";
    notes: string;
    recipient: string;
    url: string;
    sentAt: Date | null;
  },
): Promise<string> {
  const intent = recordIntent(input.method, input.state === "sent");
  // Existing writers share application → job lock order with the outcome service.
  const [previous] = input.recordId
    ? await tx.select().from(applications).where(eq(applications.id, input.recordId)).for("update")
    : [];
  if (
    input.recordId &&
    (!previous || previous.jobId !== input.jobId || previous.source !== input.method)
  )
    throw new Error("This record does not match the selected opening and method.");
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, input.jobId)).for("update");
  if (!job) throw new Error("Choose an existing opening.");
  if (input.versionId) {
    const [version] = await tx
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.id, input.versionId));
    if (!version) throw new Error("Choose an existing resume file.");
  }
  const values = {
    jobId: input.jobId,
    resumeVersionId: input.versionId,
    source: input.method,
    status: intent.status,
    appliedAt: intent.applied ? input.sentAt : null,
    applicationUrl: input.url || null,
    notes: input.notes,
  };
  let recordId: string;
  if (previous) {
    if (!(await isPlannedRecord(tx, previous)))
      throw new Error(
        "This record has already been sent or closed. Open its record to add an outcome or note.",
      );
    await tx
      .update(applications)
      .set({
        ...values,
        status: ["DRAFT", "PREPARING", "READY_FOR_REVIEW"].includes(previous.status)
          ? values.status
          : previous.status,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, previous.id));
    recordId = previous.id;
  } else {
    const [record] = await tx
      .insert(applications)
      .values(values)
      .returning({ id: applications.id });
    recordId = record.id;
  }
  await tx.insert(applicationEvents).values({
    applicationId: recordId,
    eventType: intent.eventType,
    occurredAt: input.sentAt ?? new Date(),
    summary: `${methodNames[input.method]} ${input.state === "sent" ? "recorded as sent" : "planned"} for ${job.company} — ${job.title}`,
    payload: {
      method: input.method,
      sentAt: input.sentAt?.toISOString() ?? null,
      recipient: input.recipient,
      resumeVersionId: input.versionId,
      humanConfirmed: input.state === "sent",
    },
  });
  if (intent.applied)
    await tx
      .update(jobs)
      .set({ status: "APPLIED", updatedAt: new Date() })
      .where(eq(jobs.id, input.jobId));
  await tx.insert(activityLogs).values({
    action: "JOB_ACTION_RECORDED",
    entityType: "APPLICATION",
    entityId: recordId,
    summary: `Recorded ${methodNames[input.method]} for ${job.company}`,
  });
  return recordId;
}
