import { describe, expect, it } from "vitest";
import {
  carryDecisions,
  carryNotes,
  jobOpsMethod,
  toLexicalDetails,
  toOptimizerDetails,
  toResumeNextDetails,
} from "@/features/resumes/score/map";
import type {
  LexicalAssessment,
  OptimizerAssessment,
} from "@/features/resumes/score/scoring-client";
import type { ReviewedTerm } from "@/features/resumes/score/terms";
import {
  toolDetailsSchema,
  type LexicalDetails,
  type ResumeNextDetails,
} from "@/features/resumes/fit/tools";

const terms: ReviewedTerm[] = [
  { term: "Java", aliases: [], importance: "required", jdQuote: "We need Java and Kafka." },
  { term: "Kafka", aliases: [], importance: "preferred", jdQuote: "We need Java and Kafka." },
  { term: "Jira", aliases: [], importance: "skip", jdQuote: "We need Java and Kafka." },
];
const lexical: LexicalAssessment = {
  engine_version: "1.1.0",
  status: "completed",
  scores: [
    { id: "keyword_coverage", value: 50 },
    { id: "required_coverage", value: 100 },
    { id: "preferred_coverage", value: 0 },
    { id: "weighted_coverage", value: 75 },
  ],
  findings: [
    {
      term: "Java",
      aliases: [],
      importance: "required",
      status: "mentioned",
      resume_evidence: [{ start: 0, end: 4, text: "Java", context: "Built Java services" }],
    },
    {
      term: "Kafka",
      aliases: [],
      importance: "preferred",
      status: "not_evidenced",
      resume_evidence: [],
    },
  ],
};

describe("tool result mapping", () => {
  it("lexical details parse with lexicalSchema and score is weighted", () => {
    const details = toLexicalDetails(lexical, terms, "fp", {});
    expect(toolDetailsSchema["jobops-lexical"].safeParse(details).success).toBe(true);
    expect(details.weighted).toBe(75);
    expect(details.required).toBe(100);
    expect(details.engineVersion).toBe("1.1.0");
    expect(details.termsFingerprint).toBe("fp");
    expect(details.requirements.map((r) => r.term)).toEqual(["Java", "Kafka"]);
  });

  it("notes carry forward by term", () => {
    const previous = {
      requirements: [
        {
          term: "kafka",
          aliases: [],
          importance: "preferred",
          jd_quote: "q",
          note: "Never used it",
        },
        { term: "Java", aliases: [], importance: "required", jd_quote: "q" },
      ],
    } as unknown as LexicalDetails;
    const notes = carryNotes(previous);
    expect(notes).toEqual({ kafka: "Never used it" });
    const details = toLexicalDetails(lexical, terms, "fp", notes);
    expect(details.requirements.find((r) => r.term === "Kafka")?.note).toBe("Never used it");
    expect(details.requirements.find((r) => r.term === "Java")?.note).toBeUndefined();
    expect(carryNotes(undefined)).toEqual({});
  });

  it("optimizer details parse with optimizerSchema", () => {
    const body: OptimizerAssessment = {
      engine_version: "1.1.0",
      match_score: 66.7,
      target: 80,
      method: "ats_optimizer@1.1.0: required terms found ÷ required terms × 100",
      format: [{ check: "No images", ok: true, warn: false, detail: "0 image(s) found." }],
      keywords: [
        {
          term: "Java",
          importance: "required",
          found: 2,
          unclear: false,
          where: { summary: 1, skills: 1, experience: 0 },
        },
      ],
    };
    const details = toOptimizerDetails(body, "fp");
    expect(toolDetailsSchema["resume-ats-optimizer"].safeParse(details).success).toBe(true);
    expect(details.termsFingerprint).toBe("fp");
  });

  it("ResumeNext details keep sentJobDescription and fingerprint", () => {
    const raw = {
      ats_score: 74,
      grade: "B",
      grade_label: "Good",
      categories: [{ id: "content", label: "Content", percent: 80, points: 32, max: 40 }],
      issues: [],
      keyword_coverage: { coverage_percent: 60, matched: ["java"], missing: ["spark"] },
      keywords: [],
      resume: {},
    };
    const details = toResumeNextDetails(raw, "fp", "We need Java.");
    expect(toolDetailsSchema.resumenext.safeParse(details).success).toBe(true);
    expect(details).toMatchObject({ termsFingerprint: "fp", sentJobDescription: "We need Java." });
    expect(() => toResumeNextDetails({ nope: true }, "fp", "x")).toThrow();
  });

  it("method names say the check ran in JobOps", () => {
    expect(jobOpsMethod("weighted_coverage@1.1.0")).toBe("weighted_coverage@1.1.0, run in JobOps");
  });
});

describe("ResumeNext decisions carried to a re-score", () => {
  const issue = (label: string, decision?: string) => ({
    label,
    hint: "h",
    severity: "important",
    ...(decision ? { decision } : {}),
  });
  const details = (issues: ReturnType<typeof issue>[]) =>
    ({
      ats_score: 70,
      grade: "C",
      grade_label: "SATISFACTORY",
      categories: [],
      issues,
      keyword_coverage: { coverage_percent: 40, matched: [], missing: [] },
      keywords: [],
      resume: {},
    }) as ResumeNextDetails;

  it("copies a decision onto the same label, ignoring case", () => {
    const next = carryDecisions(
      details([issue("Work Experience", "All roles have dates")]),
      details([issue("work experience"), issue("Action verbs")]),
    );
    expect(next.issues.map((i) => i.decision)).toEqual(["All roles have dates", undefined]);
  });

  it("keeps a decision the new result already has", () => {
    const next = carryDecisions(
      details([issue("Action verbs", "old")]),
      details([issue("Action verbs", "new")]),
    );
    expect(next.issues[0].decision).toBe("new");
  });

  it("returns the result unchanged without an earlier row", () => {
    const fresh = details([issue("Action verbs")]);
    expect(carryDecisions(undefined, fresh)).toEqual(fresh);
  });
});
