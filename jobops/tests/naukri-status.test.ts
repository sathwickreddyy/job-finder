import { describe, expect, it } from "vitest";
import { indiaDate, isIsoDate, naukriStatus } from "@/features/workspace/naukri-status";

describe("Naukri update status", () => {
  it("is fresh when the profile was updated today", () => {
    const status = naukriStatus(["2026-11-03", "2026-11-04"], "2026-11-04");
    expect(status).toMatchObject({ tone: "fresh", chip: "Updated today", daysSince: 0 });
    expect(status.doneInWindow).toBe(2);
  });

  it("is due the day after and late from the second day", () => {
    expect(naukriStatus(["2026-11-03"], "2026-11-04")).toMatchObject({
      tone: "due",
      chip: "Updated yesterday",
    });
    expect(naukriStatus(["2026-11-01"], "2026-11-04")).toMatchObject({
      tone: "late",
      chip: "Not updated for 3 days",
      lastDate: "2026-11-01",
    });
  });

  it("says nothing was recorded instead of inventing an age", () => {
    expect(naukriStatus([], "2026-11-04")).toMatchObject({
      tone: "none",
      chip: "No update recorded",
      lastDate: null,
      daysSince: null,
      doneInWindow: 0,
    });
  });

  it("lays out fourteen days oldest first and ending today", () => {
    const { days } = naukriStatus(["2026-11-04", "2026-10-22", "2026-10-20"], "2026-11-04");
    expect(days).toHaveLength(14);
    expect(days[0]!.iso).toBe("2026-10-22");
    expect(days[13]!.iso).toBe("2026-11-04");
    expect(days.filter((day) => day.updated).map((day) => day.iso)).toEqual([
      "2026-10-22",
      "2026-11-04",
    ]);
    expect(days[13]!.label).toBe("4 Nov");
  });

  it("ignores dates after today when finding the last update", () => {
    expect(naukriStatus(["2026-11-06", "2026-11-02"], "2026-11-04").lastDate).toBe("2026-11-02");
  });

  it("counts the India calendar day, not the host's", () => {
    expect(indiaDate(new Date("2026-11-03T19:00:00Z"))).toBe("2026-11-04");
    expect(indiaDate(new Date("2026-11-03T17:00:00Z"))).toBe("2026-11-03");
  });

  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-11-04")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("4 Nov 2026")).toBe(false);
  });
});
