import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewedTerm } from "@/features/resumes/score/terms";
import { ScoreFlow } from "@/features/resumes/score/ui/flow";
import { RunRows, type RunStatus } from "@/features/resumes/score/ui/run-rows";
import { TermReview } from "@/features/resumes/score/ui/term-review";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const noop = () => undefined;
const opening = { company: "Atlassian", title: "Senior Software Engineer" };
const description = "Must have Java and Kafka.\nNice: Docker.\nWe use Jira.";
const term = (
  t: string,
  importance: ReviewedTerm["importance"],
  jdQuote = "Must have Java and Kafka.",
) => ({
  term: t,
  aliases: [],
  importance,
  jdQuote,
});

describe("score flow rendering", () => {
  it("pill reads Score against another job on a tailored file", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(ScoreFlow, { versionId: "v", tailored: true, textReady: true }),
      ),
    );
    expect(html).toContain("Score against another job");
    expect(
      text(
        renderToStaticMarkup(
          createElement(ScoreFlow, { versionId: "v", tailored: false, textReady: true }),
        ),
      ),
    ).toContain("Score against a job");
  });

  it("is disabled with the reason when text is missing", () => {
    const html = renderToStaticMarkup(
      createElement(ScoreFlow, { versionId: "v", tailored: false, textReady: false }),
    );
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(text(html)).toContain("This file's text hasn't been extracted yet");
  });

  it("chips render the three states and the counts", () => {
    const html = renderToStaticMarkup(
      createElement(TermReview, {
        opening,
        description,
        initial: [
          term("Java", "required"),
          term("Docker", "preferred", "Nice: Docker."),
          term("Jira", "skip", "We use Jira."),
        ],
        onConfirm: noop,
        onCancel: noop,
      }),
    );
    expect(html).toContain('aria-label="Java: Required"');
    expect(html).toContain('aria-label="Docker: Preferred"');
    expect(html).toContain('aria-label="Jira: Not counted"');
    expect(text(html)).toContain("1 required, 1 preferred, 1 not counted");
    expect(text(html)).toContain("Java is required. The job says: “Must have Java and Kafka.”");
    expect(text(html)).toContain("Add a term from the job");
  });

  it("Score with these terms is disabled without a required term", () => {
    const html = renderToStaticMarkup(
      createElement(TermReview, {
        opening,
        description,
        initial: [term("Java", "preferred")],
        onConfirm: noop,
        onCancel: noop,
      }),
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Score with these terms/);
    expect(text(html)).toContain("Mark at least one term as required");
  });

  it("empty suggestions show the description and the prompt", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(TermReview, {
          opening,
          description,
          initial: [],
          onConfirm: noop,
          onCancel: noop,
        }),
      ),
    );
    expect(html).toContain("No terms were suggested for this job. Select the skills it asks for.");
    expect(html).toContain("We use Jira.");
  });

  const statuses = (patch: Partial<Record<string, RunStatus>> = {}) =>
    ({
      "jobops-lexical": { state: "done", score: 56.4, baseScore: 38.2 },
      resumenext: { state: "running" },
      "resume-ats-optimizer": { state: "waiting" },
      ...patch,
    }) as Record<"jobops-lexical" | "resumenext" | "resume-ats-optimizer", RunStatus>;

  it("run rows show where each tool runs and the ResumeNext notice", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(RunRows, {
          opening,
          statuses: statuses(),
          reviewedAt: new Date("2026-11-02T06:00:00Z"),
          onRetry: noop,
          onEditTerms: noop,
          onDone: noop,
        }),
      ),
    );
    expect(html).toContain("JobOps scoring service, on this computer");
    expect(html).toContain("Sends the text to resumenext.io");
    expect(html).toContain("current 38.2");
    expect(html).toContain(
      "Each check scores this file and the current résumé, so the comparison uses the same terms.",
    );
    expect(html).toContain("Using your terms from 2 Nov");
    expect(html).toContain("Edit terms");
  });

  it("an error row shows its message and Try again", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(RunRows, {
          opening,
          statuses: statuses({
            resumenext: {
              state: "error",
              message: "Couldn't reach ResumeNext (bridge on port 8004)",
              code: "unreachable",
            },
          }),
          reviewedAt: new Date("2026-11-02T06:00:00Z"),
          onRetry: noop,
          onEditTerms: noop,
          onDone: noop,
        }),
      ),
    );
    expect(html).toContain("Couldn't reach ResumeNext (bridge on port 8004)");
    expect(html).toContain("Try again");
  });

  it("a blank keyword score and a skipped master say so", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(RunRows, {
          opening,
          statuses: statuses({
            "jobops-lexical": { state: "done", score: null, baseScore: null },
            "resume-ats-optimizer": {
              state: "done",
              score: 60,
              baseScore: null,
              baseSkipped: "no_text",
            },
          }),
          reviewedAt: new Date("2026-11-02T06:00:00Z"),
          onRetry: noop,
          onEditTerms: noop,
          onDone: noop,
        }),
      ),
    );
    expect(html).toContain("Needs a manual look");
    expect(html).toContain("The current résumé couldn't be scored");
  });

  it("a master that failed says why", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(RunRows, {
          opening,
          statuses: statuses({
            "jobops-lexical": {
              state: "done",
              score: 56.4,
              baseScore: null,
              baseSkipped: "failed",
              baseError: "The PDF for this file is missing from storage",
            },
          }),
          reviewedAt: new Date("2026-11-02T06:00:00Z"),
          onRetry: noop,
          onEditTerms: noop,
          onDone: noop,
        }),
      ),
    );
    expect(html).toContain(
      "The current résumé couldn't be scored: The PDF for this file is missing from storage",
    );
  });
});
