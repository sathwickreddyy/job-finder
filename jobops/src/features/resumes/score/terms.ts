import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jobTermLists, resumeAssessments } from "@/db/schema";
import type { LexicalDetails } from "../fit/tools";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const reviewedTermSchema = z.strictObject({
  term: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(10),
  importance: z.enum(["required", "preferred", "skip"]),
  jdQuote: z.string().min(1).max(2000),
  // Selected by the user in the saved description rather than suggested by the catalogue.
  added: z.boolean().optional(),
});
export type ReviewedTerm = z.infer<typeof reviewedTermSchema>;

export const reviewedTermsSchema = z
  .array(reviewedTermSchema)
  .min(1)
  .max(100)
  .superRefine((terms, ctx) => {
    const seen = new Set<string>();
    for (const [i, t] of terms.entries()) {
      const key = t.term.toLocaleLowerCase();
      if (seen.has(key))
        ctx.addIssue({ code: "custom", path: [i, "term"], message: "Duplicate term" });
      seen.add(key);
    }
    if (!terms.some((t) => t.importance === "required"))
      ctx.addIssue({ code: "custom", message: "Mark at least one term as required" });
  });

/** Same terms, aliases and importance give the same fingerprint, in any order; skipped terms don't count. */
export function termsFingerprint(terms: ReviewedTerm[]): string {
  const tuples = terms
    .filter((t) => t.importance !== "skip")
    .map((t) => [t.term.toLocaleLowerCase(), [...t.aliases].sort(), t.importance] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return createHash("sha256").update(JSON.stringify(tuples)).digest("hex");
}

export function fromRequirements(requirements: LexicalDetails["requirements"]): ReviewedTerm[] {
  return requirements.map((r) => ({
    term: r.term,
    aliases: r.aliases,
    importance: r.importance,
    jdQuote: r.jd_quote,
  }));
}

export type TermList = {
  terms: ReviewedTerm[];
  fingerprint: string;
  reviewedAt: Date;
  reviewedBy: "user" | "agent";
};
const toList = (row: typeof jobTermLists.$inferSelect): TermList => ({
  terms: row.terms,
  fingerprint: row.fingerprint,
  reviewedAt: row.reviewedAt,
  reviewedBy: row.reviewedBy === "USER" ? "user" : "agent",
});

export async function saveTermList(
  snapshotId: string,
  terms: ReviewedTerm[],
  by: "user" | "agent",
  tx: Tx | typeof db = db,
): Promise<{ fingerprint: string }> {
  const fingerprint = termsFingerprint(terms);
  const values = { terms, fingerprint, reviewedBy: by.toUpperCase(), reviewedAt: new Date() };
  await tx
    .insert(jobTermLists)
    .values({ snapshotId, ...values })
    .onConflictDoUpdate({ target: jobTermLists.snapshotId, set: values });
  return { fingerprint };
}

/** The snapshot's reviewed list; a snapshot an agent already scored is seeded from that record. */
export async function getTermList(snapshotId: string): Promise<TermList | null> {
  const [row] = await db.select().from(jobTermLists).where(eq(jobTermLists.snapshotId, snapshotId));
  if (row) return toList(row);
  const [recorded] = await db
    .select({ details: resumeAssessments.details })
    .from(resumeAssessments)
    .where(
      and(
        eq(resumeAssessments.snapshotId, snapshotId),
        eq(resumeAssessments.source, "jobops-lexical"),
      ),
    )
    .orderBy(desc(resumeAssessments.createdAt))
    .limit(1);
  const requirements = (recorded?.details as Partial<LexicalDetails> | undefined)?.requirements;
  if (!requirements?.length) return null;
  await saveTermList(snapshotId, fromRequirements(requirements), "agent");
  const [seeded] = await db
    .select()
    .from(jobTermLists)
    .where(eq(jobTermLists.snapshotId, snapshotId));
  return toList(seeded);
}
