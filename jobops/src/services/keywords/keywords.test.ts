import { describe, expect, it } from "vitest";
import { compareKeywords, extractKeywords, groupKeywords } from "./index";

describe("deterministic engineering keyword extraction", () => {
  it("recognizes aliases and punctuation-heavy terms without substring matches", () => {
    const found = extractKeywords(
      "TypeScript, JavaScript, Postgres, K8s, golang, C++, C#, .NET, Node.js and CI/CD.",
    );
    expect(found).toEqual(
      expect.arrayContaining([
        "TypeScript",
        "JavaScript",
        "PostgreSQL",
        "Kubernetes",
        "Go",
        "C++",
        "C#",
        ".NET",
        "Node.js",
        "CI/CD",
      ]),
    );
    expect(found).not.toContain("Java");
    expect(extractKeywords("reactive airflows hometown pythonic ongoing")).toEqual([]);
  });

  it("handles case and token boundaries and returns one label per technology", () => {
    expect(extractKeywords("PYTHON/python; postgres PostgreSQL POSTGRES; AWS.")).toEqual([
      "AWS",
      "PostgreSQL",
      "Python",
    ]);
    expect(extractKeywords("Testing a platform")).not.toContain("Go");
  });

  it("groups known aliases and preserves manually added domain terms", () => {
    expect(groupKeywords(["postgres", "PostgreSQL", "Kafka", "Payments", ""])).toEqual({
      Messaging: ["Kafka"],
      Other: ["Payments"],
      Databases: ["PostgreSQL"],
    });
  });
});

describe("explainable keyword coverage", () => {
  it("counts unique requirements and shows matched, missing and resume-only terms", () => {
    expect(
      compareKeywords(["Python", "Kafka", "AWS", "python"], ["python", "kafka", "Snowflake"]),
    ).toEqual({
      score: 67,
      matched: ["Kafka", "Python"],
      missing: ["AWS"],
      resumeOnly: ["Snowflake"],
    });
  });

  it("normalizes aliases and returns zero when no job requirements exist", () => {
    expect(compareKeywords(["postgres", "k8s"], ["PostgreSQL", "Kubernetes"]).score).toBe(100);
    expect(compareKeywords([], ["Python"])).toEqual({
      score: 0,
      matched: [],
      missing: [],
      resumeOnly: ["Python"],
    });
    expect(compareKeywords(["Go"], []).score).toBe(0);
  });
});
