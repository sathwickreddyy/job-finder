import { describe, it, expect } from "vitest";
import { formatDate, formatRelative, fitScoreTone } from "./format";

describe("format helpers", () => {
  it("formatDate returns em-dash for null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formatDate parses ISO", () => {
    expect(formatDate("2026-05-05")).toMatch(/May 5, 2026/);
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
