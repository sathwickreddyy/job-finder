import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ToolSummary } from "@/features/resumes/fit/derive";
import type { ToolSource } from "@/features/resumes/fit/tools";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/applications/record-actions", () => ({ saveApplicationNotes: vi.fn() }));
const { parseNoteSections } = await import("@/features/applications/views/notes/sections");
const { NotesView } = await import("@/features/applications/views/notes/notes-view");
const { NotesFold } = await import("@/features/applications/views/notes/notes-fold");
const { ScoreDials } = await import("@/features/resumes/fit/score-dials");

const HASH = "546558fd0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7ebf21600";
const PATH = "/Users/sathwick/Downloads/proof/submitted.jpg";
const SERVICENOW = `## Summary

Applied to **ServiceNow** on 3 Nov through the careers portal, requisition **JB0076231**.

## On the form

- [x] Signature
- [ ] Relocation at own expense

## Proof

- Résumé SHA-256: \`${HASH}\`
- Screenshot: \`${PATH}\`
`;

const view = (notes: string, scores: Record<ToolSource, ToolSummary> | null = null) =>
  renderToStaticMarkup(createElement(NotesView, { notes, scores }));

describe("parseNoteSections", () => {
  it("splits the three template sections and keeps the rest", () => {
    const parsed = parseNoteSections(`Intro line\n\n${SERVICENOW}\n## Later\n\nExtra`);
    expect(parsed?.summary).toContain("ServiceNow");
    expect(parsed?.onTheForm).toContain("- [x] Signature");
    expect(parsed?.proof).toContain(HASH);
    expect(parsed?.rest).toContain("Intro line");
    expect(parsed?.rest).toContain("## Later");
    expect(parsed?.proof).not.toContain("Later");
  });

  it("returns null when no template heading is present", () => {
    expect(parseNoteSections("Just notes\n\n## Other\n\ntext")).toBeNull();
  });

  it("ignores headings inside code fences", () => {
    expect(parseNoteSections("```\n## Summary\n```")).toBeNull();
  });
});

describe("NotesView", () => {
  it("renders the template note readably", () => {
    const html = view(SERVICENOW);
    expect(html).toContain("text-[15px]");
    expect(html).toContain("ServiceNow");
    expect(html).toContain("✓");
    expect(html).toContain("✕");
    expect(html).toContain("Relocation at own expense");
    expect(html).toContain("546558fd…ebf21600");
    expect(html).toContain(`title="${HASH}"`);
    expect(html).toContain("Copy");
    expect(html).toContain(">submitted.jpg<");
    expect(html).toContain(`title="${PATH}"`);
    expect(html).not.toContain(`>${HASH}<`);
  });

  it("renders free Markdown unchanged with no section headings", () => {
    const html = view("Talked to **Priya**.\n\n- prep system design");
    expect(html).toContain("<strong>Priya</strong>");
    expect(html).toContain("prep system design");
    expect(html).not.toContain("On the form");
    expect(html).not.toContain("Proof");
  });

  it("says so when the note is empty", () => {
    expect(view("  ")).toContain("Nothing yet.");
  });

  it("renders no Proof heading when the note has none", () => {
    const html = view("## Summary\n\nApplied.\n\n## On the form\n\n- [x] Signature");
    expect(html).not.toContain("Proof");
    expect(html).toContain("On the form");
  });

  it("shows the dials only when scores are stored", () => {
    const scores = {
      "jobops-lexical": { score: 80, baseScore: 70, delta: 10, breakdown: [] },
      resumenext: { notChecked: true },
      "resume-ats-optimizer": { notChecked: true },
    } as Record<ToolSource, ToolSummary>;
    expect(view(SERVICENOW, scores)).toContain("Open in Résumés");
    expect(view(SERVICENOW, null)).not.toContain("Open in Résumés");
  });

  it("shows stored scores beside a free note and an empty note", () => {
    const scores = {
      "jobops-lexical": { score: 80, baseScore: 70, delta: 10, breakdown: [] },
      resumenext: { notChecked: true },
      "resume-ats-optimizer": { notChecked: true },
    } as Record<ToolSource, ToolSummary>;
    const free = view("Talked to **Priya**.", scores);
    expect(free).toContain("Open in Résumés");
    expect(free.indexOf("Open in Résumés")).toBeLessThan(free.indexOf("Priya"));
    const empty = view("", scores);
    expect(empty).toContain("Open in Résumés");
    expect(empty).toContain("Nothing yet.");
    expect(view("Talked to Priya.", null)).not.toContain("Open in Résumés");
  });
});

describe("NotesFold", () => {
  it("shows section names for a template note and the first line for a free note", () => {
    const props = { recordId: "11111111-1111-4111-8111-111111111111", scores: null };
    const template = renderToStaticMarkup(createElement(NotesFold, { ...props, notes: SERVICENOW }));
    expect(template).toContain("Summary · On the form · Proof");
    expect(template).toContain('aria-expanded="false"');
    expect(template).not.toContain("546558fd");
    const free = renderToStaticMarkup(
      createElement(NotesFold, { ...props, notes: "Call Priya Friday\n\nmore" }),
    );
    expect(free).toContain("Call Priya Friday");
  });
});

describe("ScoreDials", () => {
  const checked = (score: number, baseScore: number | null): ToolSummary => ({
    score,
    baseScore,
    delta: baseScore == null ? null : score - baseScore,
    breakdown: [],
  });

  it("shows each tool with the master score and change", () => {
    const html = renderToStaticMarkup(
      createElement(ScoreDials, {
        href: "/resumes?file=abc",
        tools: {
          "jobops-lexical": checked(82, 70),
          resumenext: checked(64, null),
          "resume-ats-optimizer": { notChecked: true },
        },
      }),
    );
    expect(html).toContain("Keyword check");
    expect(html).toContain("ResumeNext");
    expect(html).toContain("ATS optimizer");
    expect(html).toContain("Master 70");
    expect(html).toContain('href="/resumes?file=abc"');
    expect(html).toContain("Open in Résumés");
  });

  it("renders nothing when no tool was checked", () => {
    const none = { notChecked: true } as const;
    expect(
      renderToStaticMarkup(
        createElement(ScoreDials, {
          href: "/resumes",
          tools: { "jobops-lexical": none, resumenext: none, "resume-ats-optimizer": none },
        }),
      ),
    ).toBe("");
  });
});
