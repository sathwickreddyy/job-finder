import type { FitOpening, ToolSide } from "./types";

// Synthetic data for the gallery when no private check results are present.
const side = (lexical: number, rn: number, opt: number): ToolSide => ({
  lexical: {
    keyword: lexical,
    required: lexical + 5,
    preferred: lexical - 10,
    weighted: lexical + 2,
  },
  lexicalMissing: ["Go", "Spark"],
  resumenext: {
    score: rn,
    grade: "C",
    gradeLabel: "SATISFACTORY",
    categories: [
      { id: "structure", label: "Structure", percent: 71, points: 20, max: 28 },
      { id: "content", label: "Content", percent: 77, points: 34, max: 44 },
      { id: "contact", label: "Contact", percent: 100, points: 8, max: 8 },
      { id: "tailoring", label: "JD Tailoring", percent: 40, points: 8, max: 20 },
    ],
    issues: [
      {
        label: "Action verbs",
        hint: "Start each bullet point with a strong action verb.",
        severity: "important",
      },
    ],
    coverage: 40,
    matched: ["Java", "services"],
    missing: ["product", "Go"],
    entries: 12,
  },
  atsOptimizer: {
    match_score: opt,
    target: 80,
    format: [{ check: "Text-based PDF", ok: true, detail: "4,800 characters extracted" }],
    keywords: [
      {
        term: "Java",
        importance: "required",
        found: 3,
        where: { summary: 1, skills: 1, experience: 1 },
      },
      {
        term: "Go",
        importance: "required",
        found: 0,
        where: { summary: 0, skills: 0, experience: 0 },
      },
    ],
  },
});

export const sampleOpenings: FitOpening[] = [
  {
    slug: "example-backend",
    company: "Example Co",
    title: "Senior Backend Engineer",
    location: "Bengaluru, India",
    url: "https://example.com/jobs/1",
    reqId: "EX-1",
    postedAt: "2026-10-30",
    postedAtKind: "original",
    versionId: "00000000-0000-0000-0000-000000000001",
    versionLabel: "Example Co Senior Backend Engineer · EX-1",
    masterId: "00000000-0000-0000-0000-000000000000",
    requirements: [
      {
        term: "Java",
        importance: "required",
        jd_quote: "5+ years building services in Java.",
        tailored: { match: "exact", evidence: ["Built backend services in Java and Spring Boot."] },
        master: { match: "exact", evidence: ["Built backend services in Java and Spring Boot."] },
      },
      {
        term: "Go",
        importance: "required",
        jd_quote: "Experience with Go.",
        tailored: { match: "missing", evidence: [] },
        master: { match: "missing", evidence: [] },
      },
    ],
    master: side(45, 68, 50),
    tailored: side(60, 72, 50),
    changes: [
      {
        kind: "reworded",
        where: "Summary",
        before: "Engineer building services.",
        after: "Engineer building Java services.",
      },
    ],
    jdExcerpt:
      "Example Co is hiring a senior backend engineer. 5+ years building services in Java.",
    jdLength: 84,
  },
];
