import { eq } from "drizzle-orm";
import { db } from "@/db";
import { resumeVersions } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { readBuffer } from "@/services/storage";
import type { ToolSource } from "../fit/tools";
import { toLexicalDetails, toResumeNextDetails } from "./map";
import { matchResumeToJob } from "./resumenext-client";
import { assessLexical, assessOptimizer, suggestTerms } from "./scoring-client";
import { termsFingerprint, type ReviewedTerm } from "./terms";
import { ToolError, toolErrorCopy } from "./tool-error";

// Score a description: the same three checks against pasted text, with nothing saved. The
// description lives only in the sheet and these requests.

export type TextScore = { score: number | null; found?: string[] };

/** The scoring service's suggestions, each starting as a must-have (scored first, adjusted after). */
export async function suggestMustHaves(description: string): Promise<ReviewedTerm[]> {
  const seen = new Set<string>();
  return (await suggestTerms(description))
    .filter((t) => {
      const key = t.term.toLocaleLowerCase();
      return !seen.has(key) && seen.add(key);
    })
    .map((t) => ({ ...t, importance: "required" as const }));
}

export async function scoreText(
  versionId: string,
  description: string,
  tool: ToolSource,
  terms: ReviewedTerm[] | undefined,
): Promise<TextScore> {
  const [version] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, versionId));
  if (!version) throw new ApiError("Unknown résumé file.", 404);
  if (version.parsingStatus !== "COMPLETED" || !version.extractedText.trim())
    throw new ApiError("This file's text has not been extracted yet.", 422);

  if (tool === "resumenext") {
    const raw = await matchResumeToJob({
      resumeText: version.extractedText,
      jobDescription: description,
      targetRole: "",
      targetCompany: "",
    });
    return { score: toResumeNextDetails(raw, "", description).ats_score };
  }

  if (!terms?.some((t) => t.importance === "required"))
    throw new ApiError("Mark at least one must-have.", 422);
  let pdf: Buffer;
  try {
    pdf = await readBuffer(version.storagePath);
  } catch {
    throw new ToolError("missing_pdf", toolErrorCopy.missingPdf);
  }
  if (tool === "resume-ats-optimizer") {
    const result = await assessOptimizer(pdf, version.originalFilename, description, terms);
    return { score: result.match_score };
  }
  const result = await assessLexical(pdf, version.originalFilename, description, terms);
  const details = toLexicalDetails(result, terms, termsFingerprint(terms), {});
  return {
    score: details.weighted,
    found: result.findings.filter((f) => f.status === "mentioned").map((f) => f.term),
  };
}
