import { expect, it } from "vitest";
import {
  addDays,
  relativeTime,
  indiaDate,
  formatDay,
  formatTime,
  formatDayTime,
  formatWeekday,
  istClock,
  istDateTime,
  istDayStart,
  istDaysBetween,
} from "@/features/applications/dates";

it("parses a day and time in India time", () => {
  expect(istDateTime("2026-10-06", "11:00")).toEqual(new Date("2026-10-06T11:00:00+05:30"));
  expect(istDateTime("2026-10-06", "24:00")).toBeUndefined();
  expect(istDateTime("2026-02-30", "10:00")).toBeUndefined();
});
it("counts calendar days in IST, not UTC", () => {
  expect(
    istDaysBetween(new Date("2026-10-02T23:50:00+05:30"), new Date("2026-10-03T00:10:00+05:30")),
  ).toBe(1);
  expect(istDayStart(new Date("2026-10-02T19:00:00Z"))).toEqual(
    new Date("2026-10-03T00:00:00+05:30"),
  );
  expect(addDays(new Date("2026-10-03T00:00:00+05:30"), 2)).toEqual(
    new Date("2026-10-05T00:00:00+05:30"),
  );
  expect(istClock(new Date("2026-10-06T11:05:00+05:30"))).toBe("11:05");
});

it("rejects calendar rollovers while accepting leap days", () => {
  expect(istDateTime("2024-02-29", "00:00")).toEqual(new Date("2024-02-29T00:00:00+05:30"));
  for (const date of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "2026-1-01",
  ])
    expect(istDateTime(date, "11:00")).toBeUndefined();
  for (const time of ["23:60", "-1:00", "1:00", "", "09:00:00"])
    expect(istDateTime("2026-10-03", time)).toBeUndefined();
});

it("counts reversed and same IST days correctly", () => {
  const beforeMidnight = new Date("2026-10-02T23:59:00+05:30");
  const afterMidnight = new Date("2026-10-03T00:01:00+05:30");
  expect(istDaysBetween(afterMidnight, beforeMidnight)).toBe(-1);
  expect(istDaysBetween(afterMidnight, new Date("2026-10-03T23:59:00+05:30"))).toBe(0);
  expect(addDays(afterMidnight, -1)).toEqual(new Date("2026-10-02T00:01:00+05:30"));
});

it("formats displayed dates in IST with the requested readable labels", () => {
  const value = new Date("2026-10-03T10:30:00Z");
  expect(indiaDate(value)).toBe("2026-10-03");
  expect(formatDay(value)).toBe("3 Oct");
  expect(formatTime(value)).toBe("4:00 pm");
  expect(formatDayTime(value)).toBe("3 Oct, 4:00 pm");
  expect(formatWeekday(value)).toBe("Sat, 3 Oct");
});

it("describes refresh times using the IST calendar and clock", () => {
  const now = new Date("2026-10-03T10:30:00+05:30");
  expect(relativeTime(new Date("2026-10-03T10:29:40+05:30"), now)).toBe("just now");
  expect(relativeTime(new Date("2026-10-03T10:05:00+05:30"), now)).toBe("25 min ago");
  expect(relativeTime(new Date("2026-10-03T08:40:00+05:30"), now)).toBe("today at 8:40 am");
  expect(relativeTime(new Date("2026-10-01T08:40:00+05:30"), now)).toBe("1 Oct");
  expect(relativeTime(new Date("2026-10-03T10:31:00+05:30"), now)).toBe("just now");
  expect(
    relativeTime(new Date("2026-10-02T23:59:00+05:30"), new Date("2026-10-03T02:00:00+05:30")),
  ).toBe("2 Oct");
});
