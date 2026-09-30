import { expect, it } from "vitest";
import * as domain from "@/features/applications/domain";

const intent = () => {
  expect(domain).toHaveProperty("recordIntent");
  return (
    domain as unknown as {
      recordIntent: (method: string, sent: boolean) => { applied: boolean; eventType: string };
    }
  ).recordIntent;
};
it("counts a confirmed sent direct application as applied", () => {
  expect(intent()("DIRECT", true)).toMatchObject({
    applied: true,
    eventType: "APPLICATION_SUBMITTED",
  });
});
it("does not count a sent referral as a submitted application", () => {
  expect(intent()("REFERRAL", true)).toMatchObject({ applied: false, eventType: "OUTREACH_SENT" });
});
it("does not fabricate sending when saving a plan", () => {
  for (const method of ["DIRECT", "REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"])
    expect(intent()(method, false)).toMatchObject({ applied: false, eventType: "ACTION_PLANNED" });
});

it("records a real sent date in India time and rejects invalid or future dates", () => {
  const parse = (domain as unknown as { recordSentAt?: (value: string, now?: Date) => Date })
    .recordSentAt;
  expect(parse).toBeTypeOf("function");
  const now = new Date("2026-10-01T10:00:00Z");
  expect(parse!("2026-09-01", now).toISOString()).toBe("2026-08-31T18:30:00.000Z");
  expect(parse!("", now)).toEqual(now);
  expect(() => parse!("2026-02-30", now)).toThrow(/valid/);
  expect(() => parse!("2026-10-02", now)).toThrow(/future/);
});
