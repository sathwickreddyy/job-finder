import {
  toolDetailsSchema,
  type LexicalDetails,
  type OptimizerDetails,
  type ResumeNextDetails,
} from "../fit/tools";
import type { LexicalAssessment, OptimizerAssessment } from "./scoring-client";
import type { ReviewedTerm } from "./terms";
import { ToolError, toolErrorCopy } from "./tool-error";

// Shapes tool output into the fit panel's recorded-check schemas. No matching happens here.
export const jobOpsMethod = (base: string) => `${base}, run in JobOps`;

/** A file's deliberately unclaimed gaps, by lower-case term, from its latest noted record. */
export function carryNotes(previous: LexicalDetails | undefined): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const r of previous?.requirements ?? [])
    if (r.note) notes[r.term.toLocaleLowerCase()] = r.note;
  return notes;
}

export function toLexicalDetails(
  a: LexicalAssessment,
  terms: ReviewedTerm[],
  fingerprint: string,
  notes: Record<string, string>,
): LexicalDetails {
  const score = (id: string) => a.scores.find((s) => s.id === id)?.value ?? null;
  const details = {
    keyword: score("keyword_coverage"),
    required: score("required_coverage"),
    preferred: score("preferred_coverage"),
    weighted: score("weighted_coverage"),
    engineVersion: a.engine_version,
    termsFingerprint: fingerprint,
    requirements: terms
      .filter((t) => t.importance !== "skip")
      .map((t) => {
        const note = notes[t.term.toLocaleLowerCase()];
        return {
          term: t.term,
          aliases: t.aliases,
          importance: t.importance as "required" | "preferred",
          jd_quote: t.jdQuote,
          ...(note ? { note } : {}),
        };
      }),
    findings: a.findings.map((f) => ({
      term: f.term,
      aliases: f.aliases,
      importance: f.importance === "required" ? ("required" as const) : ("preferred" as const),
      status: f.status,
      resume_evidence: f.resume_evidence.map((e) => ({
        start: e.start,
        end: e.end,
        text: e.text,
        context: e.context,
      })),
    })),
  };
  return toolDetailsSchema["jobops-lexical"].parse(details);
}

export function toOptimizerDetails(a: OptimizerAssessment, fingerprint: string): OptimizerDetails {
  const { engine_version: _, ...rest } = a;
  return toolDetailsSchema["resume-ats-optimizer"].parse({
    ...rest,
    termsFingerprint: fingerprint,
  });
}

export function toResumeNextDetails(
  raw: unknown,
  fingerprint: string,
  sentJobDescription: string,
): ResumeNextDetails {
  const parsed = toolDetailsSchema.resumenext.safeParse(raw);
  if (!parsed.success) throw new ToolError("failed", toolErrorCopy.failed("ResumeNext"));
  return { ...parsed.data, termsFingerprint: fingerprint, sentJobDescription };
}
