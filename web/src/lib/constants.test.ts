import { describe, it, expect } from "vitest";
import { STATUS_RANK, ALL_STATUSES, ALL_PRIORITIES } from "./constants";

describe("constants", () => {
  it("STATUS_RANK mirrors Python order — Interviewing lowest, Archived highest", () => {
    expect(STATUS_RANK.Interviewing).toBeLessThan(STATUS_RANK.Applied);
    expect(STATUS_RANK.Applied).toBeLessThan(STATUS_RANK.Rejected);
    expect(STATUS_RANK.Rejected).toBeLessThan(STATUS_RANK.Archived);
  });

  it("ALL_STATUSES has 10 entries", () => {
    expect(ALL_STATUSES).toHaveLength(10);
  });

  it("ALL_PRIORITIES contains P0/P1/P2/Ignore", () => {
    expect(ALL_PRIORITIES).toEqual(["P0", "P1", "P2", "Ignore"]);
  });
});
