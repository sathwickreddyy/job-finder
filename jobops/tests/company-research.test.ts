import { describe, expect, it } from "vitest";
import {
  compensationAmount,
  interviewQuestions,
  publicationYear,
  researchUrl,
  type ResearchFact,
} from "@/features/companies/research-data";
import { validateFact } from "@/features/companies/validation";

const report = (data: Record<string, unknown>) =>
  ({
    data,
    sourceUrl: "https://leetcode.com/discuss/post/1",
  }) as ResearchFact;
const input = {
  factKey: "interview",
  category: "INTERVIEW",
  title: "Interview report",
  sourceUrl: "https://leetcode.com/discuss/post/1",
};
const conforming: Record<string, Record<string, unknown>> = {
  COMPENSATION: { role: "SDE-2", currency: "INR", fixedAnnual: 3100000 },
  INTERVIEW: {
    role: "SDE-2",
    outcome: "OFFER",
    roundCount: 1,
    rounds: [{ name: "Coding", kind: "DSA" }],
  },
};

describe("structured company research", () => {
  it("uses publication metadata and never substitutes event or observation years", () => {
    expect(publicationYear({ publicationYear: 2024 })).toBe("2024");
    expect(publicationYear({ publishedAt: "2025-12-31T23:30:00-05:00" })).toBe("2025");
    expect(publicationYear({ occurredAt: "2024-02-01", firstObservedAt: "2026-10-01" })).toBe(
      "Not recorded",
    );
    expect(publicationYear({ publicationYear: "2024", publishedAt: "unknown" })).toBe(
      "Not recorded",
    );
  });
  it("keeps zero compensation and preserves unknown currency without inventing totals", () => {
    expect(compensationAmount(0, "INR")).toBe("₹0");
    expect(compensationAmount(4500000, "INR")).toBe("₹45,00,000");
    expect(compensationAmount(4500000, undefined)).toBe("45,00,000 (currency not recorded)");
    expect(compensationAmount(100000, "USD")).toBe("USD 1,00,000");
    expect(compensationAmount(undefined, "INR")).toBe("Not recorded");
  });
  it("links legacy string questions to the report and nested questions to their round references", () => {
    const fact = report({
      questions: ["Explain an LRU cache"],
      rounds: [
        {
          name: "System design",
          referenceUrl: "https://example.com/round",
          questions: [
            { text: "Design a cache", topic: "Caching" },
            {
              text: "Discuss consistency",
              referenceUrl: "https://example.com/question",
              round: "Follow-up",
            },
          ],
        },
      ],
    });
    expect(interviewQuestions(fact)).toEqual([
      {
        text: "Explain an LRU cache",
        round: undefined,
        topic: undefined,
        referenceUrl: fact.sourceUrl,
      },
      {
        text: "Design a cache",
        round: "System design",
        topic: "Caching",
        referenceUrl: "https://example.com/round",
      },
      {
        text: "Discuss consistency",
        round: "Follow-up",
        topic: undefined,
        referenceUrl: "https://example.com/question",
      },
    ]);
  });
  it("does not invent questions from round summaries and handles older incomplete data safely", () => {
    expect(
      interviewQuestions(report({ rounds: ["DSA", null, { title: "Coding", summary: "Graphs" }] })),
    ).toEqual([]);
    expect(
      interviewQuestions(
        report({
          questions: [
            null,
            123,
            { text: "" },
            { text: "Real question", referenceUrl: "javascript:alert(1)" },
          ],
        }),
      )[0].referenceUrl,
    ).toBe(report({}).sourceUrl);
    expect(researchUrl("javascript:alert(1)")).toBeUndefined();
    expect(researchUrl("https://secret:password@example.com")).toBeUndefined();
  });
  it("validates publication metadata for every category and rejects conflicting dates", () => {
    for (const category of [
      "COMPENSATION",
      "INTERVIEW",
      "TECH_STACK",
      "ROLE",
      "HIRING_SIGNAL",
      "WORK_MODE",
      "REFERRAL",
      "CULTURE",
      "OTHER",
    ])
      expect(
        validateFact({
          ...input,
          category,
          data: { ...conforming[category], publishedAt: "2025-12-31", publicationYear: 2025 },
        }).data.publicationYear,
      ).toBe(2025);
    for (const data of [
      { publicationYear: "2025" },
      { publicationYear: 2025.5 },
      { publishedAt: "2025-02-30" },
      { publishedAt: "2024-01-01", publicationYear: 2025 },
    ])
      expect(() =>
        validateFact({ ...input, data: { ...conforming.INTERVIEW, ...data } }),
      ).toThrow();
  });
  it("accepts sourced structured questions alongside strings and validates their links", () => {
    const data = {
      ...conforming.INTERVIEW,
      publicationYear: 2025,
      questions: [
        "Explain queues",
        {
          text: "Design a queue",
          referenceUrl: "https://example.com/question",
          topic: "System design",
        },
      ],
      rounds: [
        {
          name: "Coding",
          kind: "DSA",
          durationMinutes: 45,
          questions: [{ text: "Reverse a list" }],
        },
      ],
    };
    expect(validateFact({ ...input, data }).data).toEqual(data);
    for (const questions of [
      [{ text: "" }],
      [{ text: "Question", referenceUrl: "javascript:alert(1)" }],
      [{ question: "Use the documented text field" }],
    ])
      expect(() =>
        validateFact({ ...input, data: { ...conforming.INTERVIEW, questions } }),
      ).toThrow();
    expect(() =>
      validateFact({
        ...input,
        data: {
          ...conforming.INTERVIEW,
          rounds: [
            {
              name: "Coding",
              kind: "DSA",
              questions: [{ text: "Question", referenceUrl: "file:///tmp/private" }],
            },
          ],
        },
      }),
    ).toThrow();
  });
});
