"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, mailConnections } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { refreshConnection } from "./refresh-service";
import { disconnectConnection } from "@/services/mail/providers/connections";
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
      .from(mailConnections)
      .where(and(eq(mailConnections.id, id), eq(mailConnections.provider, "GMAIL")));
    if (!connection) throw new Error("Connect Gmail read-only before syncing.");
    const imported = await refreshConnection(connection);
    revalidatePath("/applications");
    revalidatePath("/");
    return {
      success: `${imported.imported} recruiting messages imported; ${imported.duplicates} duplicates skipped.${imported.more ? " More messages remain. Sync again to continue from the next page." : " Refresh complete. Open Emails to read your messages."}`,
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
    await disconnectConnection(id);
    await db.transaction(async (tx) => {
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
