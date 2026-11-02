import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assessmentInput } from "@/features/resumes/assessment";
import { TrackedChanges } from "@/features/resumes/fit/changes";
import { ChipDetail, Chips } from "@/features/resumes/fit/chips";
import type { Chip, ParsedRow, ToolSummary } from "@/features/resumes/fit/derive";
import { diffResumes } from "@/features/resumes/fit/diff";
import { JobBar } from "@/features/resumes/fit/job-bar";
import { FitView } from "@/features/resumes/fit/panel";
import { Scores } from "@/features/resumes/fit/scores";
import type { Fit, FitGroup } from "@/features/resumes/fit/service";

// Visible text, with tags dropped and entities decoded.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const target = {
  jobId: "j1",
  company: "Walmart Global Tech",
  title: "Software Engineer III",
  location: "Bengaluru",
  url: "https://careers.example.invalid/R-2694949",
  reqId: "R-2694949",
  postedAt: "2026-10-30",
  postedAtKind: "LATEST_PUBLICATION",
};
const snapshot = {
  id: "s1",
  capturedAt: new Date("2026-11-02T06:00:00Z"),
  description: "Build distributed Java services.",
};
const chip = (patch: Partial<Chip>): Chip => ({
  term: "Java",
  importance: "required",
  closeness: "exact",
  isNew: false,
  quote: "You know Java.",
  evidence: ["Built Java services."],
  matched: ["Java"],
  ...patch,
});
const summary = (score: number, base: number | null): ToolSummary => ({
  score,
  baseScore: base,
  delta: base === null ? null : score - base,
  breakdown: [{ label: "Required terms", mine: score, base }],
});

const lexicalDetails = (weighted: number, fingerprint = "fp") => ({
  keyword: weighted,
  required: weighted,
  preferred: weighted,
  weighted,
  engineVersion: "1.1.0",
  termsFingerprint: fingerprint,
  requirements: [{ term: "Java", aliases: [], importance: "required" as const, jd_quote: "Java." }],
  findings: [
    {
      term: "Java",
      aliases: [],
      importance: "required" as const,
      status: "mentioned" as const,
      resume_evidence: [{ start: 0, end: 4, text: "Java", context: "Built Java services." }],
    },
  ],
});
const lexicalRow = (versionId: string, snapshotId: string, weighted: number): ParsedRow => ({
  versionId,
  snapshotId,
  source: "jobops-lexical",
  score: weighted,
  method: "weighted_coverage@1.1.0, run in JobOps",
  details: lexicalDetails(weighted),
  parsed: lexicalDetails(weighted),
  createdAt: new Date("2026-11-02T10:00:00Z"),
});
function scoredFit(): Fit {
  const other = {
    ...target,
    jobId: "j2",
    company: "Atlassian",
    title: "Senior Software Engineer",
    reqId: "REQ-3206",
  };
  const group = (
    t: typeof target,
    snapshotId: string,
    tailored: boolean,
    mine: number,
    base: number,
  ): FitGroup => ({
    snapshotId,
    target: t,
    snapshot: { ...snapshot, id: snapshotId },
    tailored,
    earlierDescription: false,
    fingerprint: "fp",
    mine: { "jobops-lexical": lexicalRow("m", snapshotId, mine) },
    base: { "jobops-lexical": lexicalRow("b", snapshotId, base) },
    olderTerms: {},
    chips: [],
    brief: null,
  });
  const groups = [group(target, "s1", true, 56.4, 38.2), group(other, "s2", false, 58.3, 61.5)];
  return {
    versionId: "m",
    baseVersionId: "b",
    target,
    snapshot,
    mine: groups[0].mine,
    base: groups[0].base,
    chips: [],
    groups,
    derivedFrom: [],
    brief: null,
    docxPath: null,
  };
}

describe("fit panel rendering", () => {
  it("job bar shows company, title and the posted line with latest publication", () => {
    const out = text(render(createElement(JobBar, { target, snapshot })));
    expect(out).toContain("Walmart Global Tech · Software Engineer III");
    expect(out).toMatch(
      /Posted 30 Oct, (\d+ days ago|today|1 day ago) \(latest publication\), req R-2694949/,
    );
  });

  it("scores show Not checked yet for a missing tool and the diagnostics line once", () => {
    const out = text(
      render(
        createElement(Scores, {
          tools: {
            "jobops-lexical": summary(61.1, 50),
            resumenext: { notChecked: true },
            "resume-ats-optimizer": summary(61.1, null),
          },
          format: [],
        }),
      ),
    );
    expect(out).toContain("Not checked yet");
    expect(out).toContain("from 50 on the master");
    expect(out).toContain("from — on the master");
    expect(out.split("Tool diagnostics, not an employer's ATS.")).toHaveLength(2);
    expect(out).toContain("The résumé rewrite rule needs all three checks.");
  });

  it("chips mark new terms with a plus and missing ones dashed", () => {
    const html = render(
      createElement(Chips, {
        chips: [
          chip({ term: "LLM", isNew: true }),
          chip({ term: "Go", closeness: "missing", evidence: [], matched: [] }),
          chip({ term: "Kafka", closeness: "unclear", importance: "preferred" }),
        ],
      }),
    );
    expect(text(html)).toContain("1 of 3 on your résumé");
    expect(text(html)).toContain("New in this version LLM");
    expect(html).toMatch(/border-dashed[^>]*>[^<]*Go/);
    expect(text(html)).toContain("Must have");
    expect(text(html)).toContain("Nice to have");
  });

  it("job bar never presents a date of unknown type as the original posting", () => {
    const out = text(
      render(createElement(JobBar, { target: { ...target, postedAtKind: null }, snapshot })),
    );
    expect(out).toMatch(/Posted 30 Oct, [^(]+\(date type not recorded\)/);
    const original = text(
      render(createElement(JobBar, { target: { ...target, postedAtKind: "ORIGINAL" }, snapshot })),
    );
    expect(original).not.toContain("(");
  });

  it("missing chip without a note says only Not on this résumé", () => {
    const plain = text(render(createElement(ChipDetail, { chip: chip({ closeness: "missing" }) })));
    expect(plain).toContain("Not on this résumé");
    expect(plain).not.toContain("Left out");
    const noted = text(
      render(
        createElement(ChipDetail, {
          chip: chip({ closeness: "missing", note: "Left out: no experience to back it" }),
        }),
      ),
    );
    expect(noted).toContain("Left out: no experience to back it");
    expect(
      text(render(createElement(ChipDetail, { chip: chip({ closeness: "unclear" }) }))),
    ).toContain("The tool couldn't tell");
  });

  it("changes header omits the unchanged claim when facts changed", () => {
    const base = "A Person\nEngineer\nPROFESSIONAL SUMMARY\nCut costs by 72% in 2024.";
    const changed = text(
      render(
        createElement(TrackedChanges, { diff: diffResumes(base, base.replace("72%", "75%")) }),
      ),
    );
    expect(changed).not.toContain("Dates, titles and numbers unchanged");
    expect(changed).toContain("72%");
    expect(changed).toContain("75%");
    const reworded = text(
      render(
        createElement(TrackedChanges, {
          diff: diffResumes(base, base.replace("Cut costs", "Cut cloud costs")),
        }),
      ),
    );
    expect(reworded).toContain("Dates, titles and numbers unchanged");
  });

  it("no scores render the Score against a job pill and derived links", () => {
    const html = render(
      createElement(FitView, {
        fit: {
          versionId: "m",
          baseVersionId: null,
          target: null,
          snapshot: null,
          mine: {},
          base: {},
          chips: [],
          groups: [],
          brief: null,
          docxPath: null,
          derivedFrom: [
            { id: "a", label: "Walmart · v2" },
            { id: "b", label: "Google One" },
          ],
        },
      }),
    );
    expect(text(html)).toContain("Score against a job");
    expect(text(html)).toContain("2 tailored files were made from this one");
    expect(html).toContain('href="/resumes?file=a"');
  });

  it("table lists the tailored job first with deltas", () => {
    const html = render(createElement(FitView, { fit: scoredFit(), selected: null }));
    const table = text(html.slice(html.indexOf("<table"), html.indexOf("</table>")));
    expect(table.indexOf("Walmart Global Tech")).toBeLessThan(table.indexOf("Atlassian"));
    expect(table).toContain("Tailored for");
    expect(table).toMatch(/56\.4 up 18\.2/);
    expect(text(html)).toContain("Arrows compare with the master on the same job.");
    expect(html).toContain(`href="/resumes?file=m&amp;fitJob=s2"`);
  });

  it("older terms row shows Re-score and no arrow", () => {
    const fit = scoredFit();
    fit.groups[1].olderTerms = { "jobops-lexical": true };
    const html = render(createElement(FitView, { fit, selected: null }));
    const row = text(
      html.slice(html.indexOf("Atlassian"), html.indexOf("</tr>", html.indexOf("Atlassian"))),
    );
    expect(row).toContain("older terms");
    expect(row).toContain("Re-score");
    expect(row).not.toMatch(/58\.3 (up|down)/);
  });

  it("table hidden with only the tailored job", () => {
    const fit = scoredFit();
    fit.groups = fit.groups.slice(0, 1);
    expect(render(createElement(FitView, { fit, selected: null }))).not.toContain("<table");
  });

  it("an earlier description is marked in the table", () => {
    const fit = scoredFit();
    fit.groups[1].earlierDescription = true;
    expect(text(render(createElement(FitView, { fit, selected: null })))).toContain(
      "earlier description",
    );
  });

  it("selecting a row swaps the job bar and scores", () => {
    const html = text(render(createElement(FitView, { fit: scoredFit(), selected: "s2" })));
    const bar = html.slice(0, html.indexOf("Arrows compare"));
    expect(bar).toContain("Atlassian · Senior Software Engineer");
    expect(html).toContain("58.3");
  });

  it("assessment form refuses tool names", () => {
    const input = {
      versionId: "11111111-1111-4111-8111-111111111111",
      snapshotId: "22222222-2222-4222-8222-222222222222",
      method: "rubric",
      score: 50,
      findings: "",
      assessedOn: "2026-11-02",
    };
    const refused = assessmentInput.safeParse({ ...input, source: " ResumeNext " });
    expect(refused.error?.issues[0].message).toBe(
      "This name is reserved for recorded tool checks.",
    );
    expect(assessmentInput.safeParse({ ...input, source: "Claude" }).success).toBe(true);
  });
});
