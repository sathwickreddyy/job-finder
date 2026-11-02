import { describe, expect, it } from "vitest";
import {
  deriveChips,
  latestBySource,
  parseToolRow,
  summarizeTool,
  type ParsedRow,
} from "@/features/resumes/fit/derive";
import type { LexicalDetails, OptimizerDetails } from "@/features/resumes/fit/tools";

const evidence = (text: string, context = `Built services in ${text}.`) => ({
  start: 0,
  end: text.length,
  text,
  context,
});

const lexical = (
  findings: LexicalDetails["findings"],
  notes: Record<string, string> = {},
): LexicalDetails => ({
  keyword: 50,
  required: 60,
  preferred: 40,
  weighted: 55,
  engineVersion: "lexical-1",
  requirements: findings.map((f) => ({
    term: f.term,
    aliases: f.aliases,
    importance: f.importance,
    jd_quote: `You know ${f.term}.`,
    ...(notes[f.term] ? { note: notes[f.term] } : {}),
  })),
  findings,
});

const finding = (
  term: string,
  status: "mentioned" | "not_evidenced" | "unclear",
  resume_evidence: ReturnType<typeof evidence>[] = [],
  aliases: string[] = [],
  importance: "required" | "preferred" = "required",
) => ({ term, aliases, importance, status, resume_evidence });

const resumenext = (score: number) => ({
  ats_score: score,
  grade: "C",
  grade_label: "SATISFACTORY",
  categories: [
    { id: "structure", label: "Structure", percent: 68, points: 19, max: 28 },
    { id: "tailoring", label: "JD Tailoring", percent: 25, points: 5, max: 20 },
  ],
  issues: [{ label: "Action verbs", hint: "Start with a verb.", severity: "important" }],
  keyword_coverage: { coverage_percent: 25, matched: ["Java"], missing: ["Go"] },
  keywords: [{ keyword: "Java", in_job: 2, in_resume: 1, missing: false }],
  resume: { experience_count: 3 },
});

const optimizer = (
  match: number,
  keywords: OptimizerDetails["keywords"] = [],
): OptimizerDetails => ({
  match_score: match,
  target: 80,
  method: "resume-ats-optimizer rubric",
  format: [{ check: "Text-based PDF", ok: true, detail: "4800 characters extracted" }],
  keywords,
});

const row = (patch: Partial<Parameters<typeof parseToolRow>[0]> = {}) => ({
  versionId: "v1",
  snapshotId: "s1",
  source: "jobops-lexical",
  score: 55,
  method: "lexical-1",
  details: lexical([finding("Java", "mentioned", [evidence("Java")])]),
  createdAt: new Date("2026-11-02T10:00:00Z"),
  ...patch,
});
const parsed = (patch: Partial<Parameters<typeof parseToolRow>[0]> = {}) =>
  parseToolRow(row(patch)) as ParsedRow;

describe("parseToolRow", () => {
  it("parseToolRow ignores a manual row named like a tool", () =>
    expect(parseToolRow(row({ source: "resumenext", details: {} }))).toBeNull());

  it("parseToolRow ignores non-tool sources", () =>
    expect(parseToolRow(row({ source: "Claude estimate" }))).toBeNull());

  it("keeps extra keys the tool returned", () => {
    const details = { ...resumenext(70), extra: "kept" };
    const result = parseToolRow(row({ source: "resumenext", score: 70, details }));
    expect(result?.parsed).toMatchObject({ ats_score: 70, extra: "kept" });
  });
});

describe("latestBySource", () => {
  it("latestBySource picks the newest row per tool", () => {
    const older = parsed({ score: 40 });
    const newer = parsed({ score: 60, createdAt: new Date("2026-11-02T11:00:00Z") });
    const otherVersion = parsed({ versionId: "v2", score: 90, createdAt: new Date("2026-11-03") });
    expect(latestBySource([newer, older, otherVersion], "v1", "s1")["jobops-lexical"]?.score).toBe(
      60,
    );
  });
});

describe("summarizeTool", () => {
  it("summarizeTool without a base row", () => {
    const summary = summarizeTool("jobops-lexical", parsed());
    expect(summary).toMatchObject({ score: 55, baseScore: null, delta: null });
    if ("notChecked" in summary) throw new Error("expected a summary");
    expect(summary.breakdown.map((b) => [b.label, b.mine, b.base])).toEqual([
      ["Required terms", 60, null],
      ["Preferred terms", 40, null],
      ["All terms", 50, null],
    ]);
  });

  it("summarizeTool notChecked", () =>
    expect(summarizeTool("resumenext", undefined, parsed())).toEqual({ notChecked: true }));

  it("reports the delta and each tool's breakdown", () => {
    const mine = parsed({ source: "resumenext", score: 74, details: resumenext(74) });
    const base = parsed({
      source: "resumenext",
      score: 72,
      details: resumenext(72),
      versionId: "m",
    });
    const summary = summarizeTool("resumenext", mine, base);
    expect(summary).toMatchObject({ score: 74, baseScore: 72, delta: 2 });
    if ("notChecked" in summary) throw new Error("expected a summary");
    expect(summary.breakdown[0]).toEqual({ label: "Structure (19/28)", mine: 68, base: 68 });
    const opt = summarizeTool(
      "resume-ats-optimizer",
      parsed({ source: "resume-ats-optimizer", score: 61.1, details: optimizer(61.1) }),
    );
    if ("notChecked" in opt) throw new Error("expected a summary");
    expect(opt.breakdown).toEqual([
      { label: "Required keywords", mine: 61.1, base: null, target: 80 },
    ]);
  });
});

describe("deriveChips", () => {
  const mine = lexical([
    finding("Java", "mentioned", [
      evidence("java"),
      evidence("Java", "Second line."),
      evidence("Java", "Third."),
    ]),
    finding("Kubernetes", "mentioned", [evidence("K8s")], ["K8s"]),
    finding("LLM", "unclear"),
    finding("Go", "not_evidenced", [], [], "preferred"),
  ]);

  it("deriveChips closeness", () => {
    const chips = deriveChips(mine);
    expect(chips.map((c) => [c.term, c.closeness, c.importance])).toEqual([
      ["Java", "exact", "required"],
      ["Kubernetes", "close", "required"],
      ["LLM", "unclear", "required"],
      ["Go", "missing", "preferred"],
    ]);
    expect(chips[0].quote).toBe("You know Java.");
    expect(chips[0].evidence).toEqual(["Built services in java.", "Second line."]);
    expect(chips[0].matched).toEqual(["java", "Java"]);
    expect(chips[1].matched).toEqual(["K8s"]);
  });

  it("deriveChips isNew", () => {
    const base = lexical([
      finding("Java", "not_evidenced"),
      finding("Kubernetes", "mentioned", [evidence("K8s")]),
    ]);
    const chips = deriveChips(mine, base);
    expect(chips.find((c) => c.term === "Java")?.isNew).toBe(true);
    expect(chips.find((c) => c.term === "Kubernetes")?.isNew).toBe(false);
    expect(deriveChips(mine).every((c) => !c.isNew)).toBe(true);
  });

  it("deriveChips note", () => {
    const noted = lexical(mine.findings, { Go: "Left out: no experience to back it" });
    expect(deriveChips(noted).find((c) => c.term === "Go")?.note).toBe(
      "Left out: no experience to back it",
    );
    expect(deriveChips(mine).find((c) => c.term === "Go")).not.toHaveProperty("note");
  });

  it("takes where from the optimizer and drops it when not found", () => {
    const chips = deriveChips(
      mine,
      undefined,
      optimizer(50, [
        {
          term: "java",
          importance: "required",
          found: 3,
          where: { summary: 1, skills: 1, experience: 1 },
        },
        {
          term: "Go",
          importance: "preferred",
          found: 0,
          where: { summary: 0, skills: 0, experience: 0 },
        },
      ]),
    );
    expect(chips[0].where).toEqual({ count: 3, places: ["summary", "skills", "experience"] });
    expect(chips.find((c) => c.term === "Go")?.where).toBeUndefined();
    expect(deriveChips(mine)[0].where).toBeUndefined();
  });
});
