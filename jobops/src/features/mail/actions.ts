"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  gmailConnections,
  mailClassifications,
  mailEvents,
  mailMessages,
  settings,
} from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { readRecruitingMail } from "@/services/mail/gmail";
import { importMailRecords, mailImportSchema } from "./import";

const eventTypes = {
  APPLICATION_ACKNOWLEDGEMENT: "ACKNOWLEDGEMENT_RECEIVED",
  ASSESSMENT: "ASSESSMENT_RECEIVED",
  INTERVIEW: "INTERVIEW_REQUESTED",
  REJECTION: "REJECTION_RECEIVED",
  OFFER: "OFFER_RECEIVED",
  RECRUITER_OUTREACH: "RECRUITER_OUTREACH",
  FOLLOW_UP: "FOLLOW_UP_RECEIVED",
  UNKNOWN: "MANUAL_NOTE",
} as const;
const suggestedStages = {
  APPLICATION_ACKNOWLEDGEMENT: "ACKNOWLEDGED",
  ASSESSMENT: "ASSESSMENT",
  INTERVIEW: "RECRUITER_SCREEN",
  REJECTION: "REJECTED",
  OFFER: "OFFER",
} as const;
export async function importMail(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const raw = formString(form, "messages");
    if (raw.length > 2000000)
      throw new Error("Import exceeds 2 MB. Split messages into smaller batches.");
    const records = mailImportSchema.parse(JSON.parse(raw));
    const result = await importMailRecords(records, "IMPORT");
    revalidatePath("/mail");
    revalidatePath("/inbox");
    revalidatePath("/");
    return {
      success: `${result.imported} messages imported; ${result.duplicates} duplicates skipped. Open a message to link it to an existing record.`,
      redirect: "/mail",
    };
  } catch (error) {
    return actionError(error);
  }
}
export async function reviewMailEvent(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const data = z
      .object({
        eventId: z.uuid(),
        applicationId: z.union([z.uuid(), z.literal("")]),
        type: z.enum(mailClassifications),
        decision: z.enum(["APPEND", "DISMISS"]),
        updateStage: z.boolean(),
      })
      .parse({
        eventId: formString(form, "eventId"),
        applicationId: formString(form, "applicationId"),
        type: formString(form, "type"),
        decision: formString(form, "decision"),
        updateStage: form.get("updateStage") === "on",
      });
    if (data.decision === "APPEND" && !data.applicationId)
      throw new Error("Choose a record before linking this message.");
    const stage = suggestedStages[data.type as keyof typeof suggestedStages];
    if (data.decision === "APPEND" && data.updateStage && !stage)
      throw new Error(
        "This category has no matching stage. Link the message without changing the stage.",
      );
    if (data.decision === "DISMISS") data.updateStage = false;
    await db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(mailEvents)
        .where(eq(mailEvents.id, data.eventId))
        .for("update");
      if (!event) throw new Error("This mail event no longer exists. Refresh the review queue.");
      if (event.status !== "NEEDS_REVIEW")
        throw new Error(
          "This mail event was already reviewed. Refresh to see its recorded result.",
        );
      const [message] = await tx
        .select()
        .from(mailMessages)
        .where(eq(mailMessages.id, event.mailMessageId));
      if (!message) throw new Error("This mail message no longer exists.");
      if (data.decision === "APPEND") {
        const [application] = await tx
          .select()
          .from(applications)
          .where(eq(applications.id, data.applicationId))
          .for("update");
        if (!application)
          throw new Error("The selected application no longer exists. Choose another application.");
        await tx.insert(applicationEvents).values({
          applicationId: application.id,
          eventType: eventTypes[data.type],
          source: "MAIL_REVIEW",
          summary: message.subject,
          occurredAt: message.receivedAt,
          confidence: event.confidence,
          payload: {
            mailMessageId: message.id,
            mailEventId: event.id,
            classification: data.type,
            manuallyReviewed: true,
            previousStage: application.status,
            stageUpdated: data.updateStage,
            ...(data.updateStage ? { nextStage: stage } : {}),
          },
        });
        if (data.updateStage)
          await tx
            .update(applications)
            .set({ status: stage, updatedAt: new Date() })
            .where(eq(applications.id, application.id));
      }
      await tx
        .update(mailEvents)
        .set({
          type: data.type,
          status: data.decision === "APPEND" ? "REVIEWED" : "DISMISSED",
          linkedApplicationId: data.decision === "APPEND" ? data.applicationId : null,
          details: {
            ...event.details,
            reviewedAt: new Date().toISOString(),
            decision: data.decision,
            updateStage: data.updateStage,
          },
        })
        .where(eq(mailEvents.id, event.id));
      await tx
        .update(mailMessages)
        .set({
          classification: data.type,
          linkedApplicationId: data.decision === "APPEND" ? data.applicationId : null,
          processedAt: new Date(),
        })
        .where(eq(mailMessages.id, message.id));
      await tx.insert(activityLogs).values({
        action: "MAIL_REVIEWED",
        entityType: "MAIL",
        entityId: message.id,
        summary:
          data.decision === "APPEND"
            ? "Reviewed recruiting mail appended to application timeline"
            : "Mail update dismissed",
        metadata: {
          mailEventId: event.id,
          applicationId: data.applicationId || null,
          updateStage: data.updateStage,
        },
      });
    });
    revalidatePath("/mail");
    revalidatePath("/inbox");
    revalidatePath("/applications");
    revalidatePath("/");
    if (data.applicationId) revalidatePath(`/applications/${data.applicationId}`);
    return {
      success:
        data.decision === "APPEND" ? "Message linked to your record." : "Message kept unlinked.",
    };
  } catch (error) {
    return actionError(error);
  }
}
export async function syncGmail(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "connectionId"));
    const [connection] = await db
      .select()
      .from(gmailConnections)
      .where(eq(gmailConnections.id, id));
    if (!connection) throw new Error("Connect Gmail read-only before syncing.");
    const cursorKey = `gmailCursor:${id}`;
    const [storedCursor] = await db.select().from(settings).where(eq(settings.key, cursorKey));
    const cursor = storedCursor?.value;
    const startedAt =
      typeof cursor?.startedAt === "string" ? new Date(cursor.startedAt) : new Date();
    const result = await readRecruitingMail(connection, {
      pageToken: typeof cursor?.pageToken === "string" ? cursor.pageToken : undefined,
      query: typeof cursor?.query === "string" ? cursor.query : undefined,
    });
    const imported = result.messages.length
      ? await importMailRecords(mailImportSchema.parse(result.messages), "GMAIL")
      : { imported: 0, duplicates: 0 };
    // A frozen query and continuation token allow bounded syncs without skipping older messages.
    await db.transaction(async (tx) => {
      if (result.nextPageToken) {
        const value = {
          pageToken: result.nextPageToken,
          query: result.query,
          startedAt: startedAt.toISOString(),
        };
        await tx
          .insert(settings)
          .values({ key: cursorKey, value })
          .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
      } else {
        await tx.delete(settings).where(eq(settings.key, cursorKey));
        await tx
          .update(gmailConnections)
          .set({ lastSyncedAt: startedAt, updatedAt: new Date() })
          .where(eq(gmailConnections.id, id));
      }
    });
    revalidatePath("/mail");
    revalidatePath("/inbox");
    revalidatePath("/");
    return {
      success: `${imported.imported} recruiting messages imported; ${imported.duplicates} duplicates skipped.${result.nextPageToken ? " More messages remain. Sync again to continue from the next page." : " Refresh complete. Open Inbox to read your messages."}`,
    };
  } catch (error) {
    return actionError(error);
  }
}
export async function disconnectGmail(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "connectionId"));
    await db.transaction(async (tx) => {
      await tx.delete(gmailConnections).where(eq(gmailConnections.id, id));
      await tx.delete(settings).where(eq(settings.key, `gmailCursor:${id}`));
      await tx.insert(activityLogs).values({
        action: "GMAIL_DISCONNECTED",
        entityType: "MAIL",
        summary: "Local Gmail credentials removed. Imported messages retained.",
      });
    });
    revalidatePath("/mail");
    revalidatePath("/settings");
    revalidatePath("/");
    return {
      success:
        "Gmail credentials removed locally. Revoke JobOps access in your Google account to remove Google's grant.",
    };
  } catch (error) {
    return actionError(error);
  }
}
