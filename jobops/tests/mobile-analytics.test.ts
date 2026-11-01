import { describe, expect, it } from "vitest";
import { mobileAnalytics } from "@/features/mobile/analytics";
import { record, at } from "./lane-fixtures";

const now = at("2026-11-02T00:15:00");
describe("mobile application analytics", () => {
  it("counts only applications and excludes outreach and previous employment", () => {
    const data = mobileAnalytics(
      [
        record({ sentAt: at("2026-11-02T00:01:00") }),
        record({ source: "PREVIOUS_JOB" }),
        record({ source: "COLD_EMAIL" }),
        record({ source: "REFERRAL" }),
      ],
      now,
    );
    expect(data.sent).toBe(1);
  });
  it("uses inclusive India calendar windows without counting tomorrow or old dates", () => {
    const data = mobileAnalytics(
      [
        record({ sentAt: at("2026-11-02T00:01:00") }),
        record({ sentAt: at("2026-11-01T23:59:00") }),
        record({ sentAt: at("2026-10-27T00:00:00") }),
        record({ sentAt: at("2026-10-26T23:59:00") }),
        record({ sentAt: at("2026-10-06T00:00:00") }),
        record({ sentAt: at("2026-10-05T23:59:00") }),
        record({ sentAt: at("2026-11-03T00:00:00") }),
      ],
      now,
    );
    expect(data.week.reduce((sum, day) => sum + day.value, 0)).toBe(3);
    expect(data.month.reduce((sum, week) => sum + week.value, 0)).toBe(5);
    expect(data.week.at(-1)?.value).toBe(1);
    expect(data.month[0].label).toBe("6 Oct");
  });
  it("keeps unknown dates out of activity and separates current interviews from closed ones", () => {
    const data = mobileAnalytics(
      [
        record({ sentAt: null, status: "PREPARING", phase: "Preparing" }),
        record({ status: "TECHNICAL_INTERVIEW", phase: "Interviewing" }),
        record({ status: "REJECTED", phase: "Closed", closedReason: "REJECTED" }),
        record({ status: "OFFER", phase: "Decision" }),
      ],
      now,
    );
    expect(data.sent).toBe(3);
    expect(data.interviewing).toBe(1);
    expect(data.closed).toBe(1);
    expect(data.offers).toBe(1);
    expect(data.week.reduce((sum, day) => sum + day.value, 0)).toBe(0);
  });
});
