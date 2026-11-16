"use server";

import { readMailItem } from "./mail-list";
import type { MailItem } from "./mail-item";

/** One email for the reading popup, in the same shape the timeline uses. */
export async function readMailForDialog(id: string): Promise<MailItem> {
  return readMailItem(id);
}
