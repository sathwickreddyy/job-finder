import { describe, expect, it } from "vitest";
import { lastActivityOf } from "@/features/companies/last-activity";
import type { TimelineDay, TimelineEntry } from "@/features/timeline/entries";

const now = new Date("2026-11-16T10:00:00Z");
const day = (...entries: TimelineEntry[]): TimelineDay =>
  ({ key: "d", label: "d", stamp: {}, entries }) as unknown as TimelineDay;
const step = (at: string) => ({ type: "step", at }) as unknown as TimelineEntry;
const round = (at: string) => ({ type: "round", at }) as unknown as TimelineEntry;
const mail = (at: string) => ({ type: "mail", at }) as unknown as TimelineEntry;

describe("lastActivityOf", () => {
  it("is null without entries", () => {
    expect(lastActivityOf([], now)).toBeNull();
    expect(lastActivityOf([[day()]], now)).toBeNull();
  });

  it("takes the newest past entry across several day lists", () => {
    const result = lastActivityOf(
      [
        [day(step("2026-11-01T05:00:00.000Z"))],
        [day(mail("2026-11-10T05:00:00.000Z"), round("2026-11-05T05:00:00.000Z"))],
        [day(mail("2026-11-08T05:00:00.000Z"))],
      ],
      now,
    );
    expect(result).toEqual({ at: "2026-11-10T05:00:00.000Z", kind: "Email" });
  });

  it("skips a round booked in the future", () => {
    const result = lastActivityOf(
      [[day(round("2026-11-20T05:00:00.000Z"), step("2026-11-02T05:00:00.000Z"))]],
      now,
    );
    expect(result).toEqual({ at: "2026-11-02T05:00:00.000Z", kind: "Recorded" });
  });

  it("names a past round", () => {
    expect(lastActivityOf([[day(round("2026-11-12T05:00:00.000Z"))]], now)).toEqual({
      at: "2026-11-12T05:00:00.000Z",
      kind: "Round",
    });
  });

  it("counts a date-only step recorded today before noon India time", () => {
    // 09:30 IST on 17 Nov; a date-only step lands at 12:00 IST that day.
    const morning = new Date("2026-11-17T04:00:00Z");
    expect(lastActivityOf([[day(step("2026-11-17T06:30:00.000Z"))]], morning)).toEqual({
      at: "2026-11-17T06:30:00.000Z",
      kind: "Recorded",
    });
  });
});
