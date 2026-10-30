import { expect, it } from "vitest";
import { handleSchema, updateSchema } from "@/features/mail/handle-service";

const id = "11111111-1111-4111-8111-111111111111";

it("accepts justInfo and outcome forms", () => {
  expect(handleSchema.parse({ justInfo: true })).toEqual({ justInfo: true });
  expect(
    handleSchema.parse({
      outcome: "scheduled",
      applicationId: id,
      details: { kind: "DSA", at: "2026-11-02T10:00:00+05:30", note: "Round 2" },
    }),
  ).toMatchObject({ outcome: "scheduled", applicationId: id });
  expect(handleSchema.parse({ outcome: "oa" })).toEqual({ outcome: "oa" });
});

it("rejects both forms together and unknown keys", () => {
  expect(handleSchema.safeParse({ justInfo: true, outcome: "oa" }).success).toBe(false);
  expect(handleSchema.safeParse({ outcome: "oa", extra: 1 }).success).toBe(false);
  expect(handleSchema.safeParse({ justInfo: false }).success).toBe(false);
  expect(handleSchema.safeParse({ outcome: "made-up" }).success).toBe(false);
  expect(handleSchema.safeParse({ outcome: "oa", details: { color: "red" } }).success).toBe(false);
});

it("rejects a future happenedAt", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  expect(
    handleSchema.safeParse({ outcome: "heard", details: { happenedAt: future } }).success,
  ).toBe(false);
  expect(
    handleSchema.safeParse({
      outcome: "heard",
      details: { happenedAt: "2026-10-01T10:00:00.000Z" },
    }).success,
  ).toBe(true);
});

it("update requires at least one field", () => {
  expect(updateSchema.safeParse({}).success).toBe(false);
  expect(updateSchema.safeParse({ tag: "spam" }).success).toBe(false);
  expect(updateSchema.safeParse({ tag: "offer", extra: true }).success).toBe(false);
  expect(updateSchema.parse({ company: null })).toEqual({ company: null });
  expect(updateSchema.parse({ application: id, tag: "process" })).toEqual({
    application: id,
    tag: "process",
  });
});
