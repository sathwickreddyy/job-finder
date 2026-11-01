import { expect, it } from "vitest";
import type { ApiCall } from "@/services/mail/providers/usage";
import { duration, groupCalls } from "./fetch-log";

const read = (at: string, status = 200, extra: Partial<ApiCall> = {}): ApiCall => ({
  at,
  label: "Read message",
  request: "GET messages/{id}?format=full",
  units: 5,
  status,
  ms: 400,
  ...extra,
});

it("merges a page of reads into one row and keeps refusals on their own", () => {
  const groups = groupCalls([
    { ...read("2026-11-01T07:25:00.000Z"), label: "List messages", request: "GET messages?q=x" },
    read("2026-11-01T07:25:01.000Z"),
    read("2026-11-01T07:25:01.000Z"),
    read("2026-11-01T07:25:02.000Z", 404),
    read("2026-11-01T07:25:03.000Z", 429, { reason: "rateLimitExceeded", waitedMs: 2000 }),
    read("2026-11-01T07:25:05.000Z"),
  ]);
  expect(groups).toMatchObject([
    { label: "List messages", count: 1, units: 5, statuses: "200", ms: 400 },
    { label: "Read message", count: 3, units: 15, statuses: "200 ×2 · 404", ms: 1400 },
    { count: 1, statuses: "429", reason: "rateLimitExceeded", waitedMs: 2000 },
    { count: 1, statuses: "200" },
  ]);
});

it("says durations briefly", () => {
  expect(duration(850)).toBe("850 ms");
  expect(duration(4200)).toBe("4.2 s");
  expect(duration(42_000)).toBe("42 s");
  expect(duration(65_000)).toBe("1 min 5 s");
  expect(duration(120_000)).toBe("2 min");
});
