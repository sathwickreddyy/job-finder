import { eq } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { applications, type mailEvents, type mailMessages } from "@/db/schema";
import type { MailTx } from "./handling-service";
import { bucketOf } from "./triage";

/** Read current stored evidence; a chosen target must never manufacture a source match. */
export async function requireRecordMail(
  executor: typeof db | MailTx,
  message: typeof mailMessages.$inferSelect,
  events: (typeof mailEvents.$inferSelect)[],
  recordId: string,
  mode: "link" | "outcome",
) {
  const suggestion = events.find(
    (event) => typeof event.details.suggestedApplicationId === "string",
  )?.details.suggestedApplicationId;
  const [matched] =
    typeof suggestion === "string" && z.uuid().safeParse(suggestion).success
      ? await executor
          .select({ id: applications.id })
          .from(applications)
          .where(eq(applications.id, suggestion))
      : [];
  const bucket = bucketOf({ ...message, recordId: matched?.id ?? null });
  if (bucket === "updates") return;
  if (message.classification === "APPLICATION_ACKNOWLEDGEMENT" && matched?.id === recordId) {
    if (mode === "link") return;
    throw new Error("Link this acknowledgement without recording an outcome.");
  }
  throw new Error(
    bucket === "roles"
      ? "This source message belongs in New roles for you. Save it as an opening from Emails."
      : "This source message belongs in Probably noise. Only Updates or a matched acknowledgement can be linked to a record.",
  );
}
