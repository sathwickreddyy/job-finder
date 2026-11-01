"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { disconnectConnection } from "@/services/mail/providers/connections";
import { importMailRecords, mailImportSchema } from "./import";

export async function importMail(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const raw = formString(form, "messages");
    if (raw.length > 2000000)
      throw new Error("Import exceeds 2 MB. Split messages into smaller batches.");
    const records = mailImportSchema.parse(JSON.parse(raw));
    const result = await importMailRecords(records, "IMPORT");
    for (const path of ["/mail", "/applications", "/"]) revalidatePath(path);
    return {
      success: `${result.imported} messages imported; ${result.duplicates} duplicates skipped. Open a message to link it to an existing record.`,
      redirect: "/mail",
    };
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
