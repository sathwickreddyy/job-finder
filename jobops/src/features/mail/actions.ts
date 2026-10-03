"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { refreshConnection } from "./refresh-service";
import { disconnectConnection } from "@/services/mail/providers/connections";
import { importMailRecords, mailImportSchema } from "./import";
import { summarizeRefresh } from "./refresh-summary";

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
      redirect: "/applications?emails=1",
    };
  } catch (error) {
    return actionError(error);
  }
}
export async function refreshAllInboxes(_previous: ActionState): Promise<ActionState> {
  void _previous;
  try {
    const connections = await db.select().from(mailConnections);
    if (!connections.length) throw new Error("Connect Gmail or Outlook before refreshing.");
    // The service saves each inbox's status under its shared connection lock. Do not
    // retry status writes here: that could overwrite a subsequent refresh's status.
    const settled = await Promise.allSettled(connections.map(refreshConnection));
    revalidatePath("/applications");
    revalidatePath("/settings");
    revalidatePath("/");
    return summarizeRefresh(
      connections.map((connection, index) => ({ email: connection.email, result: settled[index] })),
    );
  } catch (error) {
    return actionError(error);
  }
}
export async function disconnectInbox(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "connectionId"));
    const removed = await disconnectConnection(id);
    revalidatePath("/applications");
    revalidatePath("/settings");
    revalidatePath("/");
    return {
      success: `${removed.email} disconnected locally. Imported messages retained. Also remove JobOps from your Google or Microsoft account permissions.`,
    };
  } catch (error) {
    return actionError(error);
  }
}
