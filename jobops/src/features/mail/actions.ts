"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, gmailConnections, settings } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { readRecruitingMail } from "@/services/mail/gmail";
import { importMailRecords, mailImportSchema } from "./import";

export async function importMail(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const raw = formString(form, "messages");
    if (raw.length > 2000000)
      throw new Error("Import exceeds 2 MB. Split messages into smaller batches.");
    const records = mailImportSchema.parse(JSON.parse(raw));
    const result = await importMailRecords(records, "IMPORT");
    revalidatePath("/applications");
    revalidatePath("/");
    return {
      success: `${result.imported} messages imported; ${result.duplicates} duplicates skipped. Open a message to link it to an existing record.`,
      redirect: "/applications?tab=emails",
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
    revalidatePath("/applications");
    revalidatePath("/");
    return {
      success: `${imported.imported} recruiting messages imported; ${imported.duplicates} duplicates skipped.${result.nextPageToken ? " More messages remain. Sync again to continue from the next page." : " Refresh complete. Open Emails to read your messages."}`,
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
    revalidatePath("/applications");
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
