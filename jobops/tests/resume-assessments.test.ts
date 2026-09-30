import { expect, it } from "vitest";
import * as assessment from "@/features/resumes/assessment";
import type { ZodType } from "zod";
const schema = () => {
  expect(assessment).toHaveProperty("assessmentInput");
  return (assessment as unknown as { assessmentInput: ZodType }).assessmentInput;
};
const valid = {
  versionId: "00000000-0000-4000-8000-000000000001",
  snapshotId: "00000000-0000-4000-8000-000000000002",
  source: "Claude",
  method: "Version-specific keyword and formatting rubric",
  score: "72",
  assessedOn: "2026-10-01",
  findings: "Evidence missing for an unsupported keyword",
};
it("preserves a missing score instead of converting it to zero", () => {
  expect(schema().parse({ ...valid, score: "" })).toMatchObject({ score: null });
  expect(schema().parse({ ...valid, score: "0" })).toMatchObject({ score: 0 });
});
it("rejects out-of-range and invalid scores", () => {
  for (const score of ["-1", "101", "NaN", "Infinity"])
    expect(schema().safeParse({ ...valid, score }).success).toBe(false);
});
it("requires an assessment source, method and real calendar date", () => {
  for (const changed of [{ source: "" }, { method: "" }, { assessedOn: "2026-02-30" }])
    expect(schema().safeParse({ ...valid, ...changed }).success).toBe(false);
});
it("keeps the exact file and description identifiers", () => {
  expect(schema().parse(valid)).toMatchObject({
    versionId: valid.versionId,
    snapshotId: valid.snapshotId,
    score: 72,
  });
});
