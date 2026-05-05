import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatRelative,
  fitScoreTone,
} from "./format";

describe("format helpers", () => {
  it("formatDate returns em-dash for null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formatDate parses ISO", () => {
    expect(formatDate("2026-05-05")).toMatch(/May 5, 2026/);
  });

  it("formatDateTime preserves time-of-day when ISO has T component", () => {
    const out = formatDateTime("2026-05-10T15:30:00Z");
    expect(out).toMatch(/May 10, 2026/);
    // Allow any tz-shifted hour/minute rendering; the point is time is shown.
    expect(out).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  });

  it("formatDateTime falls back to date-only for bare YYYY-MM-DD", () => {
    expect(formatDateTime("2026-05-10")).toBe("May 10, 2026");
  });

  it("formatDateTime returns em-dash for null/undefined", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("formatRelative returns em-dash for null", () => {
    expect(formatRelative(null)).toBe("—");
  });

  it("fitScoreTone maps score ranges", () => {
    expect(fitScoreTone(85)).toBe("cyan");
    expect(fitScoreTone(80)).toBe("cyan");
    expect(fitScoreTone(79)).toBe("amber");
    expect(fitScoreTone(70)).toBe("amber");
    expect(fitScoreTone(65)).toBe("grey");
    expect(fitScoreTone(60)).toBe("grey");
    expect(fitScoreTone(59)).toBe("red");
    expect(fitScoreTone(0)).toBe("red");
  });
});
