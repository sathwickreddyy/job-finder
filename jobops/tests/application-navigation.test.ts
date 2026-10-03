import { describe, expect, it } from "vitest";
import { matchesFilter, queueKeyPattern, resolveView } from "@/features/applications/navigation";
import type { QueueRecord } from "@/features/applications/queue";

const NOW = new Date("2026-10-03T10:30:00+05:30");
const make = (patch: Partial<QueueRecord> = {}): QueueRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  company: "Uber",
  role: "Software Engineer II",
  source: "DIRECT",
  status: "APPLIED",
  contact: null,
  sentAt: new Date("2026-10-01T10:00:00+05:30"),
  nextActionAt: null,
  nextActionNote: "",
  rounds: [],
  events: [],
  linkedMail: [],
  ...patch,
});

describe("view resolution", () => {
  it("defaults to Next and Active", () =>
    expect(resolveView({})).toEqual({ tab: "next", filter: "active", q: "" }));
  it("keeps old Home links working", () => {
    expect(resolveView({ view: "applied" })).toMatchObject({ tab: "records", filter: "active" });
    expect(resolveView({ view: "interviews" })).toMatchObject({
      tab: "records",
      filter: "interviewing",
    });
    expect(resolveView({ view: "offers" })).toMatchObject({
      tab: "records",
      filter: "interviewing",
    });
  });
  it("ignores unknown tabs and filters", () =>
    expect(resolveView({ tab: "admin", filter: "x", q: "  Uber " })).toEqual({
      tab: "next",
      filter: "active",
      q: "Uber",
    }));
});

describe("record filters", () => {
  it("filters by phase", () => {
    expect(matchesFilter(make({ status: "OFFER" }), "interviewing", "", NOW)).toBe(true);
    expect(matchesFilter(make({ status: "REJECTED" }), "active", "", NOW)).toBe(false);
    expect(matchesFilter(make({ status: "REJECTED" }), "closed", "", NOW)).toBe(true);
  });
  it("waits on them only while the silence clock runs", () => {
    expect(matchesFilter(make(), "waiting", "", NOW)).toBe(true);
    expect(
      matchesFilter(
        make({
          source: "REFERRAL",
          status: "PREPARING",
          events: [{ eventType: "REPLY_RECEIVED", occurredAt: NOW }],
        }),
        "waiting",
        "",
        NOW,
      ),
    ).toBe(false);
  });
  it("searches company, role and contact", () => {
    expect(matchesFilter(make({ contact: "Ananya Iyer" }), "all", "ananya", NOW)).toBe(true);
    expect(matchesFilter(make(), "all", "flipkart", NOW)).toBe(false);
  });
  it("accepts only known queue keys", () => {
    expect(queueKeyPattern.test("silence:00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(queueKeyPattern.test("silence:../../etc")).toBe(false);
  });
});

it("preserves legacy outreach phases with no invented sent timestamp", () => {
  expect(
    matchesFilter(
      make({ source: "COLD_EMAIL", status: "APPLIED", sentAt: null }),
      "active",
      "",
      NOW,
    ),
  ).toBe(true);
  expect(
    matchesFilter(
      make({ source: "COLD_EMAIL", status: "APPLIED", sentAt: null }),
      "waiting",
      "",
      NOW,
    ),
  ).toBe(false);
  expect(
    matchesFilter(
      make({ source: "MANUAL", status: "TECHNICAL_INTERVIEW", sentAt: null }),
      "interviewing",
      "",
      NOW,
    ),
  ).toBe(true);
});

it("rejects malformed queue UUIDs even when they have 36 characters", () => {
  expect(queueKeyPattern.test("silence:" + "-".repeat(36))).toBe(false);
  expect(queueKeyPattern.test("deadline:00000000-0000-4000-8000-000000000001")).toBe(false);
});
