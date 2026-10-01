import { describe, expect, it } from "vitest";
import { factProblems, previewPatch, reviewFileSchema } from "@/features/companies/backfill";

const legacy = {
  factKey: "offer",
  category: "COMPENSATION",
  title: "Offer",
  sourceUrl: "https://leetcode.com/discuss/post/1",
  data: { role: "SDE-2", fixedAnnualOriginal: "31 LPA" },
};
const item = {
  companySlug: "x",
  factKey: "offer",
  category: "COMPENSATION",
  problems: [],
  current: {},
};
const file = (extra: Record<string, unknown>) =>
  reviewFileSchema.safeParse({ generatedAt: "2026-10-01", items: [{ ...item, ...extra }] }).success;

describe("company fact backfill", () => {
  it("lists every contract problem of a legacy fact", () => {
    const problems = factProblems(legacy);
    expect(problems.some((line) => line.startsWith("data.currency"))).toBe(true);
    expect(problems.some((line) => line.startsWith("data.fixedAnnual"))).toBe(true);
  });
  it("accepts a reviewed patch that keeps the original text", () => {
    const merged = previewPatch(legacy.data, { currency: "INR", fixedAnnual: 3100000 });
    expect(merged).toEqual({
      role: "SDE-2",
      fixedAnnualOriginal: "31 LPA",
      currency: "INR",
      fixedAnnual: 3100000,
    });
    expect(factProblems({ ...legacy, data: merged })).toEqual([]);
  });
  it("requires either a patch or an ambiguity reason per item", () => {
    expect(file({ patch: null, ambiguous: null })).toBe(false);
    expect(file({ patch: { currency: "INR" }, ambiguous: "Both" })).toBe(false);
    expect(file({ patch: null, ambiguous: "Bare 37, unit unclear" })).toBe(true);
    expect(file({ patch: { currency: "INR" }, ambiguous: null })).toBe(true);
  });
});
