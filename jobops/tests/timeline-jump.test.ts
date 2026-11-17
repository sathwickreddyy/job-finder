import { describe, expect, it } from "vitest";
import { jumpTarget } from "@/features/timeline/jump";
import type { TimelineDay } from "@/features/timeline/entries";

const stamp = { weekday: "Sat", day: 31, month: "Oct", year: 2026, thisYear: true, today: false };
const days = [
  {
    key: "2026-10-31",
    label: "Sat 31 Oct",
    stamp,
    entries: [
      { type: "mail", at: "2026-10-31T04:00:00.000Z", item: { id: "m1" }, recorded: null },
      {
        type: "step",
        id: "s1",
        at: "2026-10-31T03:00:00.000Z",
        applicationId: "a",
        eventType: "X",
        text: "t",
      },
      { type: "round", at: "2026-10-31T02:00:00.000Z", round: { id: "r1" }, label: "Round 1" },
    ],
  },
] as unknown as TimelineDay[];
const cards = { r1: {} } as never;

describe("jumpTarget", () => {
  it("names a row this timeline renders and leaves the filter alone when it is shown", () => {
    expect(jumpTarget("#mail-m1", days, "all", cards)).toEqual({
      id: "mail-m1",
      resetFilter: false,
    });
    expect(jumpTarget("#entry-s1", days, "stages", cards)).toEqual({
      id: "entry-s1",
      resetFilter: false,
    });
    expect(jumpTarget("#round-r1", days, "stages", cards)).toEqual({
      id: "round-r1",
      resetFilter: false,
    });
  });

  it("resets the filter when it hides the target", () => {
    expect(jumpTarget("#entry-s1", days, "mail", cards)).toEqual({
      id: "entry-s1",
      resetFilter: true,
    });
    expect(jumpTarget("#mail-m1", days, "stages", cards)).toEqual({
      id: "mail-m1",
      resetFilter: true,
    });
    expect(jumpTarget("#round-r1", days, "mail", cards)).toEqual({
      id: "round-r1",
      resetFilter: true,
    });
  });

  it("ignores hashes that name nothing here", () => {
    expect(jumpTarget("", days, "all", cards)).toBeNull();
    expect(jumpTarget("#application-x", days, "all", cards)).toBeNull();
    expect(jumpTarget("#mail-other", days, "all", cards)).toBeNull();
  });
});
