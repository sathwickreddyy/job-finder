"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { disconnectConnection } from "@/services/mail/providers/connections";
import { importMailRecords, mailImportSchema } from "./import";
import { checkMailStep, type CheckResult } from "./check-service";

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
function checkSummary(result: CheckResult) {
  const failed = result.accounts.filter((account) => account.status === "failed");
  const checked = result.accounts.length - failed.length;
  const arrivals = result.newAttention
    ? `${result.newAttention} new need attention.`
    : "No new mail.";
  return [
    checked
      ? `${arrivals} Checked ${checked} of ${result.accounts.length} inboxes.`
      : "No inbox checked.",
    result.more ? "More mail remains; check again to continue." : "",
    failed.length
      ? `Reconnect ${failed.map((account) => `${account.account} (${account.error})`).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
/** Short page-sized steps keep each request within proxy timeouts; one click runs up to four. */
export async function refreshAllInboxes(): Promise<ActionState> {
  try {
    let result = await checkMailStep();
    let arrived = result.newAttention;
    for (let step = 1; step < 4 && result.more; step++) {
      result = await checkMailStep();
      arrived += result.newAttention;
    }
    for (const path of ["/mail", "/applications", "/companies", "/"]) revalidatePath(path);
    const summary = checkSummary({ ...result, newAttention: arrived });
    return {
      ...(result.accounts.some((account) => account.status !== "failed")
        ? { success: summary }
        : { error: summary }),
      mailRefresh: { arrived, completedAt: new Date().toISOString() },
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
