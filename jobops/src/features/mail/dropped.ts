import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { mailTracking } from "@/db/schema";
import type { IngestItem } from "./ingest";

/** Dropped mail decided since a time, newest first, so a fetch or search can show what it left out. */
export async function listDropped(filter: {
  since: string;
  company?: string;
}): Promise<IngestItem[]> {
  const rows = await db
    .select()
    .from(mailTracking)
    .where(
      and(
        eq(mailTracking.disposition, "excluded"),
        gte(mailTracking.updatedAt, new Date(filter.since)),
        ...(filter.company
          ? [sql`${mailTracking.companyKeys} @> ${JSON.stringify([filter.company])}::jsonb`]
          : []),
      ),
    )
    .orderBy(desc(mailTracking.receivedAt))
    .limit(200);
  return rows.map((row) => ({
    trackingId: row.id,
    messageId: row.messageId,
    receivedAt: row.receivedAt.toISOString(),
    sender: row.sender,
    senderName: row.senderName,
    subject: row.subject,
    folders: row.folders,
    kept: false,
    tag: null,
    reason: row.reason,
    companyKeys: row.companyKeys,
  }));
}
