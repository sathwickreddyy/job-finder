import { describe, expect, it } from "vitest";
import { BRIEF_RULES, buildBrief, type FileRef } from "@/features/resumes/fit/brief";
import type { ParsedRow } from "@/features/resumes/fit/derive";
import { splitIssues, WRAPPED_LINE_REASON } from "@/features/resumes/fit/issues";
import { mustHaveRows } from "@/features/resumes/fit/must-haves";
import type { FitGroup } from "@/features/resumes/fit/service";
import type { ToolSource } from "@/features/resumes/fit/tools";

type Status = "mentioned" | "not_evidenced" | "unclear";
const finding = (
  term: string,
  status: Status,
  importance: "required" | "preferred" = "required",
) => ({
  term,
  aliases: [],
  importance,
  status,
  resume_evidence: [],
});
const lexical = {
  keyword: 50,
  required: 50,
  preferred: 0,
  weighted: 48,
  engineVersion: "1.1.0",
  termsFingerprint: "fp",
  requirements: [
    { term: "Java", aliases: [], importance: "required" as const, jd_quote: "Java is required" },
    {
      term: "Flink",
      aliases: [],
      importance: "required" as const,
      jd_quote: "Flink pipelines",
      note: "Not in my work",
    },
    { term: "Spark", aliases: [], importance: "required" as const, jd_quote: "Spark jobs" },
    { term: "gRPC", aliases: [], importance: "preferred" as const, jd_quote: "gRPC a plus" },
  ],
  findings: [
    finding("gRPC", "not_evidenced", "preferred"),
    finding("Spark", "not_evidenced"),
    finding("Java", "mentioned"),
    finding("Kafka", "mentioned"),
    finding("Go", "mentioned"),
    finding("Rust", "unclear"),
    finding("Flink", "not_evidenced"),
    finding("Scala", "mentioned"),
  ],
};
const where = (summary: number, skills: number, experience: number) => ({
  summary,
  skills,
  experience,
});
const keyword = (term: string, found: number, w = where(0, 0, 0)) => ({
  term,
  importance: "required" as const,
  found,
  where: w,
});
const optimizer = {
  match_score: 57.1,
  target: 80 as const,
  method: "ats_optimizer@1.1.0",
  termsFingerprint: "fp",
  format: [],
  keywords: [
    keyword("java", 3, where(1, 1, 1)),
    keyword("Kafka", 1, where(0, 1, 0)),
    keyword("Go", 1),
    keyword("Rust", 0),
    keyword("Spark", 0),
    keyword("Flink", 0),
  ],
};
const resumenext = (score: number) => ({
  ats_score: score,
  grade: "C",
  grade_label: "SATISFACTORY",
  categories: [],
  issues: [
    { label: "Action verbs", hint: "Start bullets with verbs", severity: "important" },
    {
      label: "Work experience",
      hint: "Add dates",
      severity: "urgent",
      decision: "All roles have dates",
    },
    {
      label: "Experience — onboarded 6+ services: company missing",
      hint: "Add company",
      severity: "important",
    },
  ],
  keyword_coverage: { coverage_percent: 40, matched: [], missing: [] },
  keywords: [],
  resume: {},
});
const row = (versionId: string, source: ToolSource, score: number, parsed: unknown): ParsedRow =>
  ({
    versionId,
    snapshotId: "s1",
    source,
    score,
    method: "m",
    details: parsed,
    parsed,
    createdAt: new Date("2026-11-02T10:00:00Z"),
  }) as ParsedRow;

function group(patch: Partial<FitGroup> = {}): FitGroup {
  return {
    snapshotId: "s1",
    target: {
      jobId: "j1",
      company: "Atlassian",
      title: "Data Platform Engineer",
      location: "Bengaluru",
      url: "https://careers.example.invalid/1",
      reqId: "REQ-1",
      postedAt: null,
      postedAtKind: null,
    },
    snapshot: {
      id: "s1",
      capturedAt: new Date("2026-11-02T06:00:00Z"),
      description: "Build Java.",
    },
    tailored: true,
    earlierDescription: false,
    fingerprint: "fp",
    mine: {
      "jobops-lexical": row("m", "jobops-lexical", 48, lexical),
      "resume-ats-optimizer": row("m", "resume-ats-optimizer", 57.1, optimizer),
      resumenext: row("m", "resumenext", 69, resumenext(69)),
    },
    base: {
      "jobops-lexical": row("b", "jobops-lexical", 40, lexical),
      resumenext: row("b", "resumenext", 66, resumenext(66)),
    },
    olderTerms: {},
    chips: [],
    brief: null,
    ...patch,
  };
}
const revised: FileRef = { versionId: "m", label: "Atlassian v2", docxPath: "/r/Atlassian.docx" };
const current: FileRef = { versionId: "b", label: "Current", docxPath: "/r/Current.docx" };

describe("ResumeNext issue split", () => {
  it("keeps decided issues with their reason and wrapped-line notes as misreads", () => {
    const { fix, keep } = splitIssues(resumenext(69).issues);
    expect(fix.map((i) => i.label)).toEqual(["Action verbs"]);
    expect(keep).toEqual([
      expect.objectContaining({ label: "Work experience", reason: "All roles have dates" }),
      expect.objectContaining({
        label: "Experience — onboarded 6+ services: company missing",
        reason: WRAPPED_LINE_REASON,
      }),
    ]);
  });
});

describe("must-have rows", () => {
  it("gives each required term a state, placed terms first", () => {
    const rows = mustHaveRows(group());
    expect(rows.map((r) => [r.term, r.state])).toEqual([
      ["Java", "shown"],
      ["Kafka", "add-bullet"],
      ["Scala", "found"],
      ["Go", "elsewhere"],
      ["Rust", "unclear"],
      ["Spark", "missing"],
      ["Flink", "missing"],
    ]);
    expect(rows[0].where).toEqual(where(1, 1, 1));
  });

  it("has no sections without an ATS optimizer row", () => {
    const rows = mustHaveRows(
      group({ mine: { "jobops-lexical": group().mine["jobops-lexical"] } }),
    );
    expect(rows.every((r) => r.where === null)).toBe(true);
    expect(rows.find((r) => r.term === "Java")?.state).toBe("found");
  });
});

describe("agent brief", () => {
  it("asks about unnoted missing and unclear terms, must-haves first", () => {
    const brief = buildBrief(group(), { revised, current })!;
    expect(brief.askUserFirst).toEqual([
      { term: "Spark", importance: "required", status: "missing", jdQuote: "Spark jobs" },
      { term: "Rust", importance: "required", status: "unclear", jdQuote: "" },
      { term: "gRPC", importance: "preferred", status: "missing", jdQuote: "gRPC a plus" },
    ]);
    expect(brief.keepOut).toEqual([
      {
        term: "Flink",
        importance: "required",
        jdQuote: "Flink pipelines",
        reason: "Not in my work",
      },
    ]);
    expect(brief.addExperienceBullet).toEqual(["Kafka"]);
    expect(brief.fixIssues).toEqual([
      { label: "Action verbs", hint: "Start bullets with verbs", severity: "important" },
    ]);
    expect(brief.keepAsIs.map((k) => k.reason)).toEqual([
      "All roles have dates",
      WRAPPED_LINE_REASON,
    ]);
    expect(brief.rules).toEqual(BRIEF_RULES);
    expect(brief.rules[2]).toContain("PATCH /api/v1/resumes/{startFrom.versionId}");
    expect(brief.rules[2]).toContain("Keep the changes the revision already made");
    expect(brief.rules[4]).toContain("snapshotId = job.snapshotId");
    expect(brief.rules[5]).toContain("carry over");
  });

  it("pairs scores with the current résumé and sends the snapshot back as the target", () => {
    const brief = buildBrief(group(), { revised, current })!;
    expect(brief.scores).toEqual({
      keywordCheck: { revised: 48, current: 40 },
      atsOptimizer: { revised: 57.1, current: null, mustHavesFound: 3, mustHaves: 7 },
      resumeNext: { revised: 69, current: 66 },
    });
    expect(brief.job).toEqual({
      snapshotId: "s1",
      target: {
        url: "https://careers.example.invalid/1",
        company: "Atlassian",
        title: "Data Platform Engineer",
        description: "Build Java.",
      },
    });
    expect(brief.startFrom).toEqual(current);
    expect(brief.revision).toEqual(revised);
  });

  it("starts from the file itself when there is no current résumé", () => {
    const brief = buildBrief(group({ base: {} }), { revised, current: null })!;
    expect(brief.startFrom).toEqual(revised);
    expect(brief.revision).toBeNull();
    expect(brief.scores.keywordCheck.current).toBeNull();
  });

  it("is null without a keyword-check row", () => {
    expect(buildBrief(group({ mine: {} }), { revised, current })).toBeNull();
  });
});
