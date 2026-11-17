import { describe, expect, it } from "vitest";
import {
  applicationPrompt,
  outreachPrompt,
  resumePrompt,
  searchPrompt,
} from "@/features/workspace/prompts";
import { BRIEF_RULES } from "@/features/resumes/fit/brief";

const olderContext = "An older application emphasized backend and data platforms.";

describe("career evidence in copied prompts", () => {
  it.each([
    ["discovery", searchPrompt("Senior Member of Technical Staff", "India", olderContext)],
    ["résumé", resumePrompt("Example", "Software Engineer", "Full-stack role", olderContext)],
    [
      "application",
      applicationPrompt(
        "Example",
        "Software Engineer",
        "Full-stack role",
        "https://example.com/job",
        olderContext,
      ),
    ],
    [
      "outreach",
      outreachPrompt(
        "Example",
        "Software Engineer",
        "Full-stack role",
        "https://example.com/job",
        "REFERRAL",
        olderContext,
      ),
    ],
  ])("keeps the full source and evidence provenance in %s", (_kind, prompt) => {
    expect(prompt).toContain(olderContext);
    expect(prompt).toMatch(/current DOCX master/);
    expect(prompt).toMatch(/professional experience and project experience/);
    expect(prompt).toMatch(/professional tenure/);
    expect(prompt).toMatch(/AI-assisted/);
    expect(prompt).toMatch(/specialist identity/);
    expect(prompt).not.toMatch(/5\+ years|React|Next\.js/);
  });

  it("keeps source and provenance rules in the recorded revision brief", () => {
    const rules = BRIEF_RULES.join("\n");
    expect(rules).toMatch(/current DOCX master/);
    expect(rules).toMatch(/professional experience and project experience/);
    expect(rules).toMatch(/professional tenure/);
    expect(rules).toMatch(/specialist identity/);
  });

  it("keeps the comparison file while requiring reconciliation with the master", () => {
    expect(BRIEF_RULES[2]).toMatch(/current DOCX master/);
    expect(BRIEF_RULES[2]).toContain("startFrom.docxPath");
    expect(BRIEF_RULES[2]).toMatch(/baseline/);
  });
});
