import { describe, expect, it } from "vitest";
import { resumePrompt, searchPrompt } from "@/features/simple-preview/prompts";

describe("prompts for existing assistant conversations", () => {
  it("tells the user which actual file to attach for a specific role", () => {
    const prompt = resumePrompt(
      "India company",
      "Backend engineer",
      "Build Kafka services in Pune",
      "Keep my confirmed experience",
      "backend-v2.pdf",
    );
    expect(prompt).toContain("backend-v2.pdf");
    expect(prompt).toContain("Build Kafka services in Pune");
    expect(prompt).toContain("Keep my confirmed experience");
    expect(prompt).not.toMatch(/api\/v1|proposals|bearer|task progress/i);
  });
  it("keeps search preferences and India eligibility in the copied request", () => {
    const prompt = searchPrompt("Platform engineer", "Bengaluru", "Prefer product engineering");
    expect(prompt).toContain("Bengaluru");
    expect(prompt).toContain("Prefer product engineering");
    expect(prompt).toContain("candidates based in India");
    expect(prompt).toContain("do not invent openings");
  });
});
