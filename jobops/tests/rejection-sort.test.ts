import { expect, it } from "vitest";
import { rejectionKind, type RoundTime } from "@/features/mail/rejection-sort";

const at = (iso: string) => new Date(iso);
const round = (patch: Partial<RoundTime> = {}): RoundTime => ({
  scheduledAt: at("2026-10-20T05:00:00Z"),
  createdAt: at("2026-10-18T05:00:00Z"),
  outcome: "PASSED",
  ...patch,
});
const email = at("2026-10-25T05:00:00Z");

it("no rounds is an application rejection", () =>
  expect(rejectionKind(email, [])).toBe("REJECTION"));
it("a round before the email is after interview", () =>
  expect(rejectionKind(email, [round()])).toBe("INTERVIEW_REJECTION"));
it("a round after the email does not count", () =>
  expect(rejectionKind(email, [round({ scheduledAt: at("2026-10-26T05:00:00Z") })])).toBe(
    "REJECTION",
  ));
it("a cancelled round does not count", () =>
  expect(rejectionKind(email, [round({ outcome: "CANCELLED" })])).toBe("REJECTION"));
it("a round with no time counts by when it was recorded", () => {
  expect(rejectionKind(email, [round({ scheduledAt: null })])).toBe("INTERVIEW_REJECTION");
  expect(
    rejectionKind(email, [round({ scheduledAt: null, createdAt: at("2026-10-26T05:00:00Z") })]),
  ).toBe("REJECTION");
});
