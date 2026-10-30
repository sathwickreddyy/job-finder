import { expect, it } from "vitest";
import { agentRecordSchema, recordWarnings } from "@/features/applications/agent-record";

const resume = "33333333-3333-4333-8333-333333333333";
const input = {
  opening: { url: "https://jobs.example.invalid/sde-2", company: "Acme", title: "SDE II" },
  application: { method: "DIRECT" },
  humanConfirmed: true,
};

it("requires humanConfirmed true", () => {
  expect(agentRecordSchema.safeParse(input).success).toBe(true);
  expect(agentRecordSchema.safeParse({ ...input, humanConfirmed: false }).success).toBe(false);
  expect(
    agentRecordSchema.safeParse({ opening: input.opening, application: input.application }).success,
  ).toBe(false);
  expect(agentRecordSchema.safeParse({ ...input, extra: 1 }).success).toBe(false);
});

it("rejects postedAtKind without postedAt", () => {
  const opening = (patch: Record<string, unknown>) => ({
    ...input,
    opening: { ...input.opening, ...patch },
  });
  expect(agentRecordSchema.safeParse(opening({ postedAtKind: "original" })).success).toBe(false);
  expect(
    agentRecordSchema.safeParse(opening({ postedAtSourceUrl: "https://jobs.example.invalid" }))
      .success,
  ).toBe(false);
  expect(
    agentRecordSchema.safeParse(opening({ postedAt: "2026-10-20", postedAtKind: "original" }))
      .success,
  ).toBe(true);
  expect(agentRecordSchema.safeParse(opening({ postedAt: "20 Oct" })).success).toBe(false);
});

it("freshness uses Asia/Kolkata calendar days", () => {
  // 20:00 UTC on 30 Oct is already 31 Oct in India.
  const now = new Date("2026-10-30T20:00:00Z");
  expect(recordWarnings({ postedAt: "2026-10-17", resumeVersionId: resume }, now)).toEqual([]);
  expect(recordWarnings({ postedAt: "2026-10-16", resumeVersionId: resume }, now)).toEqual([
    "Posted 15 days ago, more than 14 calendar days (Asia/Kolkata).",
  ]);
});

it("warns on unknown date and missing resume", () => {
  expect(recordWarnings({}, new Date("2026-10-30T10:00:00Z"))).toEqual([
    "Posting date unknown. Verify it before applying to similar openings.",
    "No resume file recorded for this application.",
  ]);
});
