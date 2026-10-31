import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, mailMessages, settings } from "@/db/schema";
import { autoApplyMail } from "./auto-apply";
import { loadMailContext } from "./context";
import { notExcluded } from "./mail-list";

export const CATCH_UP_KEY = "mailSyncCatchUp";
export const CATCH_UP_VERSION = 1;

/**
 * The one-time pass that brings stored mail up to date with its applications (spec §2):
 * the mail rule runs over kept, placed emails oldest first, so an acknowledgement applies
 * before a later rejection. Only open mail and untouched recovered history are read; mail the
 * user acted on is blocked by the rule itself. A `settings` marker makes it run once.
 */
export async function catchUpMailSync(
  now = new Date(),
): Promise<{ skipped: boolean; applied: number; asked: number }> {
  const context = await loadMailContext();
  return db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({ key: CATCH_UP_KEY, value: { version: 0 } })
      .onConflictDoNothing();
    const [marker] = await tx
      .select()
      .from(settings)
      .where(eq(settings.key, CATCH_UP_KEY))
      .for("update");
    if (Number(marker.value.version ?? 0) >= CATCH_UP_VERSION)
      return { skipped: true, applied: 0, asked: 0 };
    const candidates = await tx
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(
        and(
          notExcluded,
          isNotNull(mailMessages.companyKey),
          sql`(${mailMessages.attentionState} <> 'DONE' OR EXISTS (SELECT 1 FROM mail_tracking t WHERE t.message_id = "mail_messages"."id" AND t.recovered))`,
        ),
      )
      .orderBy(asc(mailMessages.receivedAt), asc(mailMessages.id));
    let applied = 0;
    let asked = 0;
    let failed = 0;
    for (const { id } of candidates) {
      // One email that cannot apply rolls back alone and never blocks the rest.
      try {
        const effect = await tx.transaction((step) => autoApplyMail(step, id, context, now));
        if (effect.kind === "acknowledge" || effect.kind === "outcome") applied++;
        if (effect.kind === "ask") asked++;
      } catch (error) {
        failed++;
        console.error(`Mail catch-up skipped ${id}`, error);
      }
    }
    await tx
      .update(settings)
      .set({
        value: { version: CATCH_UP_VERSION, ranAt: now.toISOString(), applied, asked, failed },
      })
      .where(eq(settings.key, CATCH_UP_KEY));
    await tx.insert(activityLogs).values({
      action: "MAIL_SYNC_CAUGHT_UP",
      entityType: "MAIL",
      entityId: null,
      summary: `Brought stored mail up to date: ${applied} applied, ${asked} asking`,
      metadata: { applied, asked, failed },
    });
    return { skipped: false, applied, asked };
  });
}
