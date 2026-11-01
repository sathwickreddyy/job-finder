import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, mailMessages, settings } from "@/db/schema";
import { autoApplyMail } from "./auto-apply";
import { loadMailContext } from "./context";
import { notExcluded } from "./mail-list";

export const CATCH_UP_KEY = "mailSyncCatchUp";
export const CATCH_UP_VERSION = 1;
/** Tries per email, counting the first pass, before the catch-up stops retrying it. */
const MAX_ATTEMPTS = 3;

type Retry = { id: string; attempts: number };
const retriesOf = (value: Record<string, unknown>): Retry[] =>
  Array.isArray(value.retry)
    ? value.retry.filter(
        (row): row is Retry => typeof row?.id === "string" && Number.isInteger(row?.attempts),
      )
    : [];

/**
 * The one-time pass that brings stored mail up to date with its applications (spec §2):
 * the mail rule runs over kept, placed emails oldest first, so an acknowledgement applies
 * before a later rejection. Only open mail and untouched recovered history are read; mail the
 * user acted on is blocked by the rule itself. A `settings` marker makes it run once; an email
 * the rule failed on is retried at the next starts, up to three tries in all.
 */
export async function catchUpMailSync(
  now = new Date(),
): Promise<{ skipped: boolean; applied: number; asked: number; failed: number }> {
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
    const value = marker.value as Record<string, unknown>;
    const done = Number(value.version ?? 0) >= CATCH_UP_VERSION;
    const pending = done ? retriesOf(value) : [];
    if (done && !pending.length) return { skipped: true, applied: 0, asked: 0, failed: 0 };
    const candidates = await tx
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(
        done
          ? inArray(
              mailMessages.id,
              pending.map((row) => row.id),
            )
          : and(
              notExcluded,
              isNotNull(mailMessages.companyKey),
              sql`(${mailMessages.attentionState} <> 'DONE' OR EXISTS (SELECT 1 FROM mail_tracking t WHERE t.message_id = "mail_messages"."id" AND t.recovered))`,
            ),
      )
      .orderBy(asc(mailMessages.receivedAt), asc(mailMessages.id));
    let applied = 0;
    let asked = 0;
    let failed = 0;
    const retry: Retry[] = [];
    const gaveUp = Array.isArray(value.gaveUp) ? (value.gaveUp as string[]) : [];
    for (const { id } of candidates) {
      // One email that cannot apply rolls back alone and never blocks the rest.
      try {
        const effect = await tx.transaction((step) => autoApplyMail(step, id, context, now));
        if (effect.kind === "acknowledge" || effect.kind === "outcome") applied++;
        if (effect.kind === "ask") asked++;
      } catch (error) {
        failed++;
        const attempts = (pending.find((row) => row.id === id)?.attempts ?? 0) + 1;
        if (attempts < MAX_ATTEMPTS) retry.push({ id, attempts });
        else gaveUp.push(id);
        console.error(`Mail catch-up skipped ${id} (try ${attempts} of ${MAX_ATTEMPTS})`, error);
      }
    }
    await tx
      .update(settings)
      .set({
        value: {
          ...value,
          version: CATCH_UP_VERSION,
          ranAt: done ? value.ranAt : now.toISOString(),
          ...(done ? { retriedAt: now.toISOString() } : {}),
          applied: Number(done ? (value.applied ?? 0) : 0) + applied,
          asked: Number(done ? (value.asked ?? 0) : 0) + asked,
          failed,
          retry,
          gaveUp,
        },
      })
      .where(eq(settings.key, CATCH_UP_KEY));
    await tx.insert(activityLogs).values({
      action: "MAIL_SYNC_CAUGHT_UP",
      entityType: "MAIL",
      entityId: null,
      summary: `${done ? "Retried" : "Brought"} stored mail up to date: ${applied} applied, ${asked} asking`,
      metadata: { applied, asked, failed },
    });
    return { skipped: false, applied, asked, failed };
  });
}
