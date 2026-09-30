import { describe, expect, it } from "vitest";
import { displayDate, normalizeDisplayPreferences } from "./preferences";

describe("saved date display preferences", () => {
  it("preserves defaults and recovers from invalid legacy settings", () => {
    expect(normalizeDisplayPreferences()).toEqual({ timezone: "Asia/Kolkata", dateFormat: "ISO" });
    expect(
      normalizeDisplayPreferences({ timezone: "invalid-timezone", dateFormat: "invalid-format" }),
    ).toEqual({ timezone: "Asia/Kolkata", dateFormat: "ISO" });
    expect(displayDate(null, normalizeDisplayPreferences())).toBe("Not recorded");
    expect(displayDate(undefined, normalizeDisplayPreferences())).toBe("Not recorded");
  });
  it("formats ISO dates at the user's timezone, including midnight boundaries", () => {
    const value = new Date("2026-09-30T20:15:00Z");
    expect(displayDate(value, { timezone: "Asia/Kolkata", dateFormat: "ISO" })).toBe("2026-10-01");
    expect(displayDate(value, { timezone: "Asia/Kolkata", dateFormat: "ISO" }, true)).toBe(
      "2026-10-01 01:45 Asia/Kolkata",
    );
    expect(displayDate(value, { timezone: "America/New_York", dateFormat: "ISO" }, true)).toBe(
      "2026-09-30 16:15 America/New_York",
    );
  });
  it("uses local date formatting while retaining the selected timezone", () => {
    const value = new Date("2026-09-30T20:15:00Z");
    expect(displayDate(value, { timezone: "Asia/Kolkata", dateFormat: "LOCAL" })).toBe(
      "1 Oct 2026",
    );
    expect(displayDate(value, { timezone: "Asia/Kolkata", dateFormat: "LOCAL" }, true)).toContain(
      "1:45",
    );
  });
  it("observes daylight saving transitions without manually offsetting timestamps", () => {
    const preferences = { timezone: "America/New_York", dateFormat: "ISO" as const };
    expect(displayDate(new Date("2026-03-08T06:30:00Z"), preferences, true)).toBe(
      "2026-03-08 01:30 America/New_York",
    );
    expect(displayDate(new Date("2026-03-08T07:30:00Z"), preferences, true)).toBe(
      "2026-03-08 03:30 America/New_York",
    );
  });
});
