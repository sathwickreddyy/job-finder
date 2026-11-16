import { describe, expect, it } from "vitest";
import { questionInput } from "@/features/interviews/questions";
import { roundLabel } from "@/features/applications/round-label";

describe("question input", () => {
  it("trims patterns and drops case-insensitive duplicates", () => {
    const parsed = questionInput.parse({
      title: "  Longest substring  ",
      patterns: ["  Sliding window ", "sliding window", "Hash map"],
    });
    expect(parsed.title).toBe("Longest substring");
    expect(parsed.patterns).toEqual(["Sliding window", "Hash map"]);
  });

  it("rejects a 201-character title and nine patterns", () => {
    expect(questionInput.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => `p${i}`);
    expect(questionInput.safeParse({ title: "Q", patterns: nine }).success).toBe(false);
  });

  it("rejects a review without its source", () => {
    expect(questionInput.safeParse({ title: "Q", review: "x" }).success).toBe(false);
    expect(
      questionInput.safeParse({ title: "Q", review: "x", reviewSource: "Claude Code" }).success,
    ).toBe(true);
  });

  it("accepts lowercase outcomes only", () => {
    expect(questionInput.parse({ title: "Q", outcome: "solved_aloud" }).outcome).toBe(
      "solved_aloud",
    );
    expect(questionInput.safeParse({ title: "Q", outcome: "SOLVED_ALOUD" }).success).toBe(false);
  });
});

describe("round labels", () => {
  it("numbers technical rounds and names people rounds", () => {
    expect(roundLabel("DSA", 1)).toBe("Round 1 · DSA");
    expect(roundLabel("LLD", 2)).toBe("Round 2 · LLD");
    expect(roundLabel("HIRING_MANAGER", 0)).toBe("Managerial round");
    expect(roundLabel("HR", 0)).toBe("HR round");
    expect(roundLabel("BEHAVIORAL", 0)).toBe("Behavioural round");
  });
});
