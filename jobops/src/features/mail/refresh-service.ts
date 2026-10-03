import { eq } from "drizzle-orm";
import { mailConnections, settings } from "@/db/schema";
import { providerFor } from "@/services/mail/providers";
import { withConnectionLock } from "@/services/mail/providers/connections";
import type { Cursor, MailConnection } from "@/services/mail/providers/types";
import { importMailRecords, mailImportSchema } from "./import";

export type RefreshResult = { imported: number; duplicates: number; more: boolean };
/** Retains committed arrivals if a later page or error-status write fails. */
export class MailRefreshError extends Error {
  constructor(
    message: string,
    readonly result: RefreshResult,
    readonly statusSaved: boolean,
  ) {
    super(message);
  }
}
export async function refreshConnection(connection: MailConnection): Promise<RefreshResult> {
  return withConnectionLock(connection.id, async (database, current) => {
    const provider = providerFor(current.provider);
    const cursorKey = `mailCursor:${current.id}`;
    const [stored] = await database.select().from(settings).where(eq(settings.key, cursorKey));
    let cursor = (stored?.value as Cursor | undefined) ?? undefined;
    const startedAt = cursor?.startedAt ? new Date(cursor.startedAt) : new Date();
    let imported = 0,
      duplicates = 0;
    try {
      for (let pages = 0; pages < 4; pages++) {
        const page = await provider.listRecruitingMail(current, cursor);
        const nextCursor = page.nextCursor
          ? { ...page.nextCursor, startedAt: startedAt.toISOString() }
          : undefined;
        const result = await database.transaction(async (tx) => {
          const result = page.messages.length
            ? await importMailRecords(
                mailImportSchema.parse(page.messages),
                provider.id,
                current.email,
                tx,
              )
            : { imported: 0, duplicates: 0 };
          if (nextCursor)
            await tx
              .insert(settings)
              .values({ key: cursorKey, value: nextCursor })
              .onConflictDoUpdate({
                target: settings.key,
                set: { value: nextCursor, updatedAt: new Date() },
              });
          else await tx.delete(settings).where(eq(settings.key, cursorKey));
          await tx
            .update(mailConnections)
            .set({
              ...(nextCursor ? {} : { lastSyncedAt: startedAt }),
              lastRefreshedAt: new Date(),
              lastRefreshedCount: imported + result.imported,
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(mailConnections.id, current.id));
          return result;
        });
        imported += result.imported;
        duplicates += result.duplicates;
        cursor = nextCursor;
        if (!cursor) break;
      }
      return { imported, duplicates, more: Boolean(cursor) };
    } catch (error) {
      // Providers emit credential-free messages. Never serialize response bodies/tokens.
      const message =
        error instanceof Error && !error.cause && error.name !== "ZodError"
          ? error.message
          : "The inbox could not be refreshed. Check the connection and try again.";
      let statusSaved = false;
      try {
        await database
          .update(mailConnections)
          .set({ lastRefreshedCount: imported, lastError: message, updatedAt: new Date() })
          .where(eq(mailConnections.id, current.id));
        statusSaved = true;
      } catch {
        /* A status-write failure must not discard successful page counts. */
      }
      throw new MailRefreshError(
        message,
        { imported, duplicates, more: Boolean(cursor) },
        statusSaved,
      );
    }
  });
}
