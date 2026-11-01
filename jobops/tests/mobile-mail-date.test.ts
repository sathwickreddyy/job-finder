import { expect, it } from "vitest";
import { mailTimestamp } from "@/features/mobile/mail-date";

it("includes historical years and compares them using India calendar dates", () => {
  const now = new Date("2026-01-01T00:10:00+05:30");
  expect(mailTimestamp("2025-12-31T18:29:00Z", now)).toContain("2025");
  expect(mailTimestamp("2025-12-31T18:30:00Z", now)).not.toContain("2025");
  expect(mailTimestamp("2025-12-31T18:30:00Z", now)).not.toContain("2026");
});
