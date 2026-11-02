import { z } from "zod";
import type { ReviewedTerm } from "./terms";
import { ToolError, toolErrorCopy } from "./tool-error";

// The JobOps scoring service (services/resume-scoring). Next.js only sends documents and reads
// results; every match and score is computed there.
const base = () => process.env.SCORING_URL ?? "http://127.0.0.1:3212";
const TIMEOUT_MS = 30_000;
const MAX_RETRY_WAIT_MS = 5_000;

const importance = z.enum(["required", "preferred", "unspecified"]);
export const lexicalAssessmentSchema = z.looseObject({
  engine_version: z.string(),
  status: z.enum(["completed", "needs_review", "unable_to_assess"]),
  scores: z.array(z.looseObject({ id: z.string(), value: z.number().nullable() })),
  findings: z.array(
    z.looseObject({
      term: z.string(),
      aliases: z.array(z.string()),
      importance,
      status: z.enum(["mentioned", "not_evidenced", "unclear"]),
      resume_evidence: z.array(
        z.looseObject({
          start: z.number(),
          end: z.number(),
          text: z.string(),
          context: z.string(),
        }),
      ),
    }),
  ),
});
export type LexicalAssessment = z.infer<typeof lexicalAssessmentSchema>;

export const optimizerAssessmentSchema = z.looseObject({
  engine_version: z.string(),
  match_score: z.number(),
  target: z.literal(80),
  method: z.string(),
  format: z.array(
    z.looseObject({ check: z.string(), ok: z.boolean(), warn: z.boolean(), detail: z.string() }),
  ),
  keywords: z.array(
    z.looseObject({
      term: z.string(),
      importance: z.enum(["required", "preferred"]),
      found: z.number(),
      unclear: z.boolean(),
      where: z.looseObject({ summary: z.number(), skills: z.number(), experience: z.number() }),
    }),
  ),
});
export type OptimizerAssessment = z.infer<typeof optimizerAssessmentSchema>;

const suggestionSchema = z.object({
  requirements: z.array(
    z.object({ term: z.string(), aliases: z.array(z.string()), jd_quote: z.string() }),
  ),
});

async function call(path: string, init: () => RequestInit, retried = false): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, {
      ...init(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ToolError("unreachable", toolErrorCopy.scoringUnreachable);
  }
  if (response.status === 429 && !retried) {
    const wait = Math.min(
      Number(response.headers.get("retry-after") ?? 2) * 1000,
      MAX_RETRY_WAIT_MS,
    );
    await new Promise((resolve) => setTimeout(resolve, wait));
    return call(path, init, true);
  }
  if (response.status === 429) throw new ToolError("busy", toolErrorCopy.busy);
  const text = await response.text();
  if (response.status === 422)
    throw text.includes("jd_quote")
      ? new ToolError("terms_stale", toolErrorCopy.termsStale)
      : new ToolError("unreadable", toolErrorCopy.unreadable);
  if (!response.ok) throw new ToolError("unreachable", toolErrorCopy.scoringUnreachable);
  return JSON.parse(text);
}

function metadata(jd: string, terms: ReviewedTerm[]) {
  // The service checks quotes too, but its validation errors carry no message to tell why.
  if (terms.some((t) => !jd.includes(t.jdQuote)))
    throw new ToolError("terms_stale", toolErrorCopy.termsStale);
  return JSON.stringify({
    job_description: jd,
    requirements: terms
      .filter((t) => t.importance !== "skip")
      .map((t) => ({
        term: t.term,
        aliases: t.aliases,
        importance: t.importance,
        jd_quote: t.jdQuote,
      })),
  });
}

function multipart(pdf: Buffer, filename: string, json: string) {
  return () => {
    const form = new FormData();
    form.set("resume", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
    form.set("metadata", json);
    return { method: "POST", body: form };
  };
}

function parse<T>(schema: z.ZodType<T>, body: unknown, tool: string): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new ToolError("failed", toolErrorCopy.failed(tool));
  return result.data;
}

export async function suggestTerms(jd: string) {
  const body = await call("/v1/requirements/suggest", () => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_description: jd }),
  }));
  return parse(suggestionSchema, body, "The scoring service").requirements.map((r) => ({
    term: r.term,
    aliases: r.aliases,
    jdQuote: r.jd_quote,
  }));
}

export async function assessLexical(
  pdf: Buffer,
  filename: string,
  jd: string,
  terms: ReviewedTerm[],
): Promise<LexicalAssessment> {
  const json = metadata(jd, terms);
  const body = await call("/v1/assessments/pdf", multipart(pdf, filename, json));
  const result = parse(lexicalAssessmentSchema, body, "The Keyword check");
  if (result.status === "unable_to_assess")
    throw new ToolError("unreadable", toolErrorCopy.unreadable);
  return result;
}

export async function assessOptimizer(
  pdf: Buffer,
  filename: string,
  jd: string,
  terms: ReviewedTerm[],
): Promise<OptimizerAssessment> {
  const json = metadata(jd, terms);
  const body = await call("/v1/ats-optimizer/pdf", multipart(pdf, filename, json));
  return parse(optimizerAssessmentSchema, body, "The ATS optimizer");
}
