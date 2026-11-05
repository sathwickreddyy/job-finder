import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { indiaDate, isIsoDate, naukriStatus } from "./naukri-status";

export const NAUKRI_KEY = "naukriUpdates";
const KEEP = 120;

export const naukriUpdateSchema = z.object({
  /** Defaults to today in India; a past day is allowed for backfilling a verified update. */
  indiaDate: z.string().refine(isIsoDate, "Use a YYYY-MM-DD date.").optional(),
  action: z.string().trim().min(1).max(80),
  /** What was observed on Naukri, for example the displayed "Profile last updated - Today". */
  evidence: z.string().trim().min(1).max(500),
  /** The agent saw the update on Naukri itself; this route never edits Naukri. */
  verified: z.literal(true),
});
export type NaukriUpdateInput = z.infer<typeof naukriUpdateSchema>;

type Stored = { indiaDate: string; verifiedAt: string; action: string; evidence: string };
const updatesOf = (value: Record<string, unknown> | undefined): Stored[] =>
  Array.isArray(value?.updates)
    ? value.updates.filter(
        (row): row is Stored => typeof row?.indiaDate === "string" && isIsoDate(row.indiaDate),
      )
    : [];

export async function readNaukriStatus(now = new Date()) {
  const [row] = await db.select().from(settings).where(eq(settings.key, NAUKRI_KEY));
  return naukriStatus(
    updatesOf(row?.value).map((update) => update.indiaDate),
    indiaDate(now),
  );
}

/** Records one verified update day. A day already recorded is kept as it was. */
export async function recordNaukriUpdate(input: NaukriUpdateInput, now = new Date()) {
  const today = indiaDate(now);
  const date = input.indiaDate ?? today;
  if (date > today) throw new ApiError("A Naukri update cannot be dated in the future.", 409);
  await db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({ key: NAUKRI_KEY, value: { updates: [] } })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(settings)
      .where(eq(settings.key, NAUKRI_KEY))
      .for("update");
    const updates = updatesOf(row?.value);
    if (updates.some((update) => update.indiaDate === date)) return;
    const next = [
      ...updates,
      {
        indiaDate: date,
        verifiedAt: now.toISOString(),
        action: input.action,
        evidence: input.evidence,
      },
    ]
      .sort((a, b) => a.indiaDate.localeCompare(b.indiaDate))
      .slice(-KEEP);
    await tx
      .update(settings)
      .set({ value: { updates: next }, updatedAt: now })
      .where(eq(settings.key, NAUKRI_KEY));
  });
  return readNaukriStatus(now);
}
