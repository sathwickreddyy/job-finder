import { describe, expect, it, vi } from "vitest";
import { confirmCancel, draftOf, isDirty } from "@/features/interviews/views/editor-state";

describe("question editor state", () => {
  it("is clean for identical drafts and dirty after a title change", () => {
    const initial = draftOf();
    expect(isDirty(initial, { ...initial })).toBe(false);
    expect(isDirty(initial, { ...initial, title: "Two sum" })).toBe(true);
    expect(isDirty(initial, { ...initial, patterns: ["Hash map"] })).toBe(true);
  });

  it("builds a draft from a saved question", () => {
    const draft = draftOf({
      id: "q1",
      roundId: "r1",
      position: 1,
      title: "Longest substring",
      patterns: ["Sliding window"],
      prompt: "p",
      answer: "a",
      outcome: "solved_aloud",
      time: "O(n)",
      space: "O(k)",
      interviewer: "",
      review: "",
      reviewSource: null,
      reviewedAt: null,
      updatedAt: "2026-11-16T10:00:00.000Z",
    });
    expect(draft).toMatchObject({
      title: "Longest substring",
      outcome: "solved_aloud",
      time: "O(n)",
    });
  });

  it("asks before discarding unsaved changes", () => {
    const ask = vi.fn(() => false);
    expect(confirmCancel(true, ask)).toBe(false);
    expect(ask).toHaveBeenCalledOnce();
    const never = vi.fn(() => true);
    expect(confirmCancel(false, never)).toBe(true);
    expect(never).not.toHaveBeenCalled();
  });
});
