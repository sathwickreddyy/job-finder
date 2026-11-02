import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assessmentInput } from "@/features/resumes/assessment";
import { TrackedChanges } from "@/features/resumes/fit/changes";
import { ChipDetail, Chips } from "@/features/resumes/fit/chips";
import type { Chip, ToolSummary } from "@/features/resumes/fit/derive";
import { diffResumes } from "@/features/resumes/fit/diff";
import { JobBar } from "@/features/resumes/fit/job-bar";
import { FitView } from "@/features/resumes/fit/panel";
import { Scores } from "@/features/resumes/fit/scores";

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

  it("no target renders Not tailored for a job and derived links", () => {
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
          derivedFrom: [
            { id: "a", label: "Walmart · v2" },
            { id: "b", label: "Google One" },
          ],
        },
      }),
    );
    expect(text(html)).toContain("Not tailored for a job");
    expect(text(html)).toContain("2 tailored files were made from this one");
    expect(html).toContain('href="/resumes?file=a"');
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
