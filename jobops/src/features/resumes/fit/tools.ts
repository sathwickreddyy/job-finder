import { z } from "zod";

// Recorded tool checks are kept whole (loose objects) so nothing a tool returned is lost.
export const TOOL_SOURCES = ["jobops-lexical", "resumenext", "resume-ats-optimizer"] as const;
export type ToolSource = (typeof TOOL_SOURCES)[number];

export function isToolSource(source: string): source is ToolSource {
  return (TOOL_SOURCES as readonly string[]).includes(source);
}

const percent = z.number().min(0).max(100).nullable();
const importance = z.enum(["required", "preferred"]);

const lexicalSchema = z.looseObject({
  keyword: percent,
  required: percent,
  preferred: percent,
  weighted: percent,
  engineVersion: z.string().min(1),
  requirements: z.array(
    z.looseObject({
      term: z.string().min(1),
      aliases: z.array(z.string()),
      importance,
      jd_quote: z.string(),
      // Why a term was deliberately left unclaimed, saved with the version.
      note: z.string().optional(),
    }),
  ),
  findings: z.array(
    z.looseObject({
      term: z.string().min(1),
      aliases: z.array(z.string()),
      importance,
      status: z.enum(["mentioned", "not_evidenced", "unclear"]),
      resume_evidence: z.array(
        z.looseObject({
          start: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
          text: z.string(),
          context: z.string(),
        }),
      ),
    }),
  ),
});

const resumeNextSchema = z.looseObject({
  ats_score: z.number().min(0).max(100),
  grade: z.string(),
  grade_label: z.string(),
  categories: z.array(
    z.looseObject({
      id: z.string(),
      label: z.string(),
      percent: z.number(),
      points: z.number(),
      max: z.number(),
    }),
  ),
  issues: z.array(
    z.looseObject({
      label: z.string(),
      hint: z.string(),
      severity: z.string(),
      // The agent's "not changing because…" note.
      decision: z.string().optional(),
    }),
  ),
  keyword_coverage: z.looseObject({
    coverage_percent: z.number(),
    matched: z.array(z.string()),
    missing: z.array(z.string()),
  }),
  keywords: z.array(z.looseObject({})),
  resume: z.looseObject({}),
});

const optimizerSchema = z.looseObject({
  match_score: z.number().min(0).max(100),
  target: z.literal(80),
  method: z.string(),
  format: z.array(
    z.looseObject({
      check: z.string(),
      ok: z.boolean(),
      warn: z.boolean().optional(),
      detail: z.string(),
    }),
  ),
  keywords: z.array(
    z.looseObject({
      term: z.string(),
      importance,
      found: z.number().int().nonnegative(),
      where: z.looseObject({
        summary: z.number().int().nonnegative(),
        skills: z.number().int().nonnegative(),
        experience: z.number().int().nonnegative(),
      }),
    }),
  ),
});

/** A row the fit panel reads: a tool's name and details that parse; anything else is manual. */
export function isRecordedToolCheck(source: string, details: unknown) {
  return isToolSource(source) && toolDetailsSchema[source].safeParse(details).success;
}

export const toolDetailsSchema = {
  "jobops-lexical": lexicalSchema,
  resumenext: resumeNextSchema,
  "resume-ats-optimizer": optimizerSchema,
} satisfies Record<ToolSource, z.ZodType>;

export type LexicalDetails = z.infer<typeof lexicalSchema>;
export type ResumeNextDetails = z.infer<typeof resumeNextSchema>;
export type OptimizerDetails = z.infer<typeof optimizerSchema>;

export const TOOL_META: Record<ToolSource, { name: string; by: string; method: string }> = {
  "jobops-lexical": {
    name: "Keyword check",
    by: "JobOps scoring service",
    method: "Reviewed job requirements found on the résumé, required terms weighted 3×.",
  },
  resumenext: {
    name: "ResumeNext",
    by: "match_resume_to_job",
    method: "ResumeNext's own 100-point score: structure, content, contact and tailoring.",
  },
  "resume-ats-optimizer": {
    name: "ATS optimizer",
    by: "resume-ats-optimizer skill",
    method: "Required keywords found ÷ required keywords. The skill suggests 80% or more.",
  },
};
