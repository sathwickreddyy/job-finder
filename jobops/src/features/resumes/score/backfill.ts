import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { resumeAssessments, settings } from "@/db/schema";
import { lexicalSchema } from "../fit/tools";
import { fromRequirements, termsFingerprint } from "./terms";

export const TERM_FINGERPRINT_KEY = "resumeTermFingerprints";
const VERSION = 1;

/**
 * The one-time pass that gives rows recorded before term lists existed their fingerprint. An
 * agent records a fit's rows together, so each row takes the fingerprint of the jobops-lexical
 * row with the same file, snapshot and creation time; rows without one are left alone.
 */
export async function backfillTermFingerprints(): Promise<{ skipped: boolean; stamped: number }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({ key: TERM_FINGERPRINT_KEY, value: { version: 0 } })
      .onConflictDoNothing();
    const [marker] = await tx
      .select()
      .from(settings)
      .where(eq(settings.key, TERM_FINGERPRINT_KEY))
      .for("update");
    if (marker.value.version === VERSION) return { skipped: true, stamped: 0 };

    const lexical = await tx
      .select()
      .from(resumeAssessments)
      .where(eq(resumeAssessments.source, "jobops-lexical"));
    let stamped = 0;
    for (const row of lexical) {
      const parsed = lexicalSchema.safeParse(row.details);
      if (!parsed.success) continue;
      const fingerprint = termsFingerprint(fromRequirements(parsed.data.requirements));
      const updated = await tx
        .update(resumeAssessments)
        .set({
          details: sql`${resumeAssessments.details} || jsonb_build_object('termsFingerprint', ${fingerprint}::text)`,
        })
        .where(
          and(
            eq(resumeAssessments.versionId, row.versionId),
            eq(resumeAssessments.snapshotId, row.snapshotId),
            // Compared in SQL: a JavaScript Date drops PostgreSQL's microseconds.
            sql`(select r.created_at from resume_assessments r where r.id = ${row.id}) = ${resumeAssessments.createdAt}`,
            sql`not (${resumeAssessments.details} ? 'termsFingerprint')`,
          ),
        )
        .returning({ id: resumeAssessments.id });
      stamped += updated.length;
    }
    await tx
      .update(settings)
      .set({ value: { version: VERSION }, updatedAt: new Date() })
      .where(eq(settings.key, TERM_FINGERPRINT_KEY));
    return { skipped: false, stamped };
  });
}
