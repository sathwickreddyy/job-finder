import { describe, expect, it } from "vitest";
import { computeProfileDiff } from "./diff";
describe("approved profile differences", () => {
  it("lists only target differences and identifies skill changes", () => { expect(computeProfileDiff({ headline: "Engineer", skills: ["Java"], privateField: "unchanged" }, { headline: "Senior Engineer", skills: ["Java", "Kafka"] })).toEqual([{ field: "headline", current: "Engineer", target: "Senior Engineer" }, { field: "skills", current: ["Java"], target: ["Java", "Kafka"], added: ["Kafka"], removed: [] }]); });
  it("does not produce a write for UNKNOWN and ignores object/array order", () => { expect(computeProfileDiff({ skills: ["Java", "Kafka"], metadata: { b: 2, a: 1 } }, { skills: ["Kafka", "Java"], metadata: { a: 1, b: 2 }, headline: "UNKNOWN" })).toEqual([]); });
  it("marks unobserved state explicitly", () => { expect(computeProfileDiff({}, { headline: "Engineer" })[0].current).toBe("UNKNOWN"); });
});
