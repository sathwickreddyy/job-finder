import { expect, it } from "vitest";
import { checkWindow, type CheckProgress } from "./check-service";

const released = "2026-10-29T00:00:00.000Z";
const now = new Date("2026-10-30T12:00:00Z");
const stored: CheckProgress = {
  since: "2026-10-30T08:00:00.000Z",
  until: "2026-10-30T10:00:00.000Z",
  next: "page-2",
  complete: false,
  scanned: 25,
  folders: [{ id: "inbox", name: "Inbox" }],
  checkedAt: "2026-10-30T10:00:05.000Z",
};

it("resumes an incomplete window unchanged", () => {
  expect(checkWindow(stored, released, now)).toEqual(stored);
});

it("overlaps a complete window by exactly one hour", () => {
  const window = checkWindow({ ...stored, next: undefined, complete: true }, released, now);
  expect(window.since).toBe("2026-10-30T09:00:00.000Z");
  expect(window.until).toBe(now.toISOString());
  expect(window).toMatchObject({ complete: false, scanned: 0 });
  expect(window.next).toBeUndefined();
});

it("starts a never-fetched account at release", () => {
  expect(checkWindow(undefined, released, now)).toMatchObject({
    since: released,
    until: now.toISOString(),
    complete: false,
  });
});

it("fixes until at the first step", () => {
  const first = checkWindow(undefined, released, now);
  const later = new Date("2026-10-30T13:00:00Z");
  expect(checkWindow({ ...first, next: "page-2", scanned: 25 }, released, later).until).toBe(
    first.until,
  );
});
