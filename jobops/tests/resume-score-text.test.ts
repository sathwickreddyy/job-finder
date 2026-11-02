import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewedTerm } from "@/features/resumes/score/terms";

const mocks = vi.hoisted(() => ({
  version: null as Record<string, unknown> | null,
  suggestTerms: vi.fn(),
  assessLexical: vi.fn(),
  assessOptimizer: vi.fn(),
  matchResumeToJob: vi.fn(),
  readBuffer: vi.fn(),
  writes: vi.fn(),
}));

// Every write method throws: scoring pasted text must never touch the database beyond one read.
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => (mocks.version ? [mocks.version] : []) }) }),
    insert: mocks.writes,
    update: mocks.writes,
    delete: mocks.writes,
    transaction: mocks.writes,
  },
}));
vi.mock("@/services/storage", () => ({ readBuffer: mocks.readBuffer }));
vi.mock("@/features/resumes/score/scoring-client", () => ({
  suggestTerms: mocks.suggestTerms,
  assessLexical: mocks.assessLexical,
  assessOptimizer: mocks.assessOptimizer,
}));
vi.mock("@/features/resumes/score/resumenext-client", () => ({
  matchResumeToJob: mocks.matchResumeToJob,
}));

const { scoreText, suggestMustHaves } = await import("@/features/resumes/score/text");

const id = "11111111-1111-4111-8111-111111111111";
const jd = "We need Java and Kafka. Go is a plus.";
const terms: ReviewedTerm[] = [
  { term: "Java", aliases: [], importance: "required", jdQuote: "We need Java and Kafka." },
  { term: "Kafka", aliases: [], importance: "required", jdQuote: "We need Java and Kafka." },
  { term: "Go", aliases: [], importance: "preferred", jdQuote: "Go is a plus." },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.version = {
    id,
    parsingStatus: "COMPLETED",
    extractedText: "Built Java services on Kafka.",
    storagePath: "resumes/x.pdf",
    originalFilename: "x.pdf",
  };
  mocks.readBuffer.mockResolvedValue(Buffer.from("%PDF"));
});

describe("suggestMustHaves", () => {
  it("starts every suggested term as a must-have, once", async () => {
    mocks.suggestTerms.mockResolvedValue([
      { term: "Java", aliases: [], jdQuote: "We need Java and Kafka." },
      { term: "java", aliases: [], jdQuote: "We need Java and Kafka." },
      { term: "Go", aliases: [], jdQuote: "Go is a plus." },
    ]);
    const result = await suggestMustHaves(jd);
    expect(result.map((t) => [t.term, t.importance])).toEqual([
      ["Java", "required"],
      ["Go", "required"],
    ]);
  });
});

describe("scoreText", () => {
  it("returns the Keyword check's weighted score and the terms it found", async () => {
    mocks.assessLexical.mockResolvedValue({
      engine_version: "1.1.0",
      status: "completed",
      scores: [{ id: "weighted_coverage", value: 85.7 }],
      findings: [
        {
          term: "Java",
          aliases: [],
          importance: "required",
          status: "mentioned",
          resume_evidence: [],
        },
        {
          term: "Go",
          aliases: [],
          importance: "preferred",
          status: "not_evidenced",
          resume_evidence: [],
        },
      ],
    });
    await expect(scoreText(id, jd, "jobops-lexical", terms)).resolves.toEqual({
      score: 85.7,
      found: ["Java"],
    });
    expect(mocks.assessLexical).toHaveBeenCalledWith(expect.any(Buffer), "x.pdf", jd, terms);
    expect(mocks.writes).not.toHaveBeenCalled();
  });

  it("returns the ATS optimizer's match score", async () => {
    mocks.assessOptimizer.mockResolvedValue({ match_score: 67 });
    await expect(scoreText(id, jd, "resume-ats-optimizer", terms)).resolves.toEqual({ score: 67 });
  });

  it("sends ResumeNext the extracted text with no opening, and ignores terms", async () => {
    mocks.matchResumeToJob.mockResolvedValue({
      ats_score: 72,
      grade: "B",
      grade_label: "Good",
      categories: [],
      issues: [],
      keyword_coverage: { coverage_percent: 60, matched: ["java"], missing: [] },
      keywords: [],
      resume: {},
    });
    await expect(scoreText(id, jd, "resumenext", undefined)).resolves.toEqual({ score: 72 });
    expect(mocks.matchResumeToJob).toHaveBeenCalledWith({
      resumeText: "Built Java services on Kafka.",
      jobDescription: jd,
      targetRole: "",
      targetCompany: "",
    });
    expect(mocks.readBuffer).not.toHaveBeenCalled();
    expect(mocks.writes).not.toHaveBeenCalled();
  });

  it("refuses term checks without a must-have", async () => {
    const none = terms.map((t) => ({ ...t, importance: "preferred" as const }));
    await expect(scoreText(id, jd, "jobops-lexical", none)).rejects.toThrow(/must-have/);
    await expect(scoreText(id, jd, "resume-ats-optimizer", undefined)).rejects.toThrow(/must-have/);
    expect(mocks.assessLexical).not.toHaveBeenCalled();
  });

  it("refuses unknown and unextracted files", async () => {
    mocks.version = null;
    await expect(scoreText(id, jd, "resumenext", undefined)).rejects.toMatchObject({ status: 404 });
    mocks.version = { id, parsingStatus: "PENDING", extractedText: "" };
    await expect(scoreText(id, jd, "resumenext", undefined)).rejects.toMatchObject({ status: 422 });
  });
});
