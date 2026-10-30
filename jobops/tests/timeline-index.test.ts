import { describe, expect, it } from "vitest";
import type { Lane, LaneGroup, LaneNext } from "@/features/applications/lanes";
import type { Due } from "@/features/applications/queue";
import { companyRows, type MailFacts } from "@/features/timeline/index-rows";
import { NOW } from "./lane-fixtures";

const next = (due: Due | null, when: string, text = "Follow up"): LaneNext => ({
  recordId: "record",
  due,
  at: NOW,
  when,
  text,
  action: "Open",
  href: "/applications",
});
const lane = (key: string, group: LaneGroup, patch: Partial<Lane> = {}): Lane => ({
  key,
  company: key.toUpperCase(),
  leadId: `${key}-lead`,
  roles: [],
  status: { tone: "applied", label: "Applied" },
  dots: [],
  next: null,
  group,
  lastActivity: 0,
  ...patch,
});
const facts = (key: string | null, patch: Partial<MailFacts> = {}): MailFacts => ({
  key,
  open: 0,
  total: 1,
  latestAt: "2026-10-02T05:00:00.000Z",
  latestOpenKind: null,
  ...patch,
});
const rows = (input: Partial<Parameters<typeof companyRows>[0]>) =>
  companyRows({ lanes: [], mail: [], names: new Map(), matches: null, ...input });

describe("companyRows", () => {
  it("maps lane groups", () => {
    const result = rows({
      lanes: [lane("a", "needs"), lane("b", "active"), lane("c", "closed")],
      names: new Map([["a", { name: "Acme", slug: "acme" }]]),
    });
    expect(result.rows.map((row) => [row.key, row.group])).toEqual([
      ["a", "needs"],
      ["b", "waiting"],
      ["c", "closed"],
    ]);
    expect(result.rows[0]).toMatchObject({ name: "Acme", slug: "acme", newCount: 0 });
    expect(result.rows[1]).toMatchObject({ name: "B", slug: null });
  });

  it("open mail forces Needs you", () => {
    const result = rows({
      lanes: [lane("a", "active", { next: next("week", "Sun") })],
      mail: [facts("a", { open: 1, latestOpenKind: "Interview" })],
    });
    expect(result.rows[0]).toMatchObject({
      group: "needs",
      newCount: 1,
      signal: "Interview",
      latestAt: "2026-10-02T05:00:00.000Z",
    });
  });

  it("uses the lane's next step as the signal without open mail", () => {
    const result = rows({
      lanes: [lane("a", "active", { next: next("week", "Sun", "Follow up if it stays quiet") })],
      mail: [facts("a")],
    });
    expect(result.rows[0].signal).toBe("Follow up if it stays quiet");
    expect(result.rows[0].next).toBe("Follow up if it stays quiet");
    expect(rows({ lanes: [lane("b", "closed")] }).rows[0].signal).toBe("Applied");
  });

  it("adds mail-only companies", () => {
    const result = rows({
      lanes: [lane("a", "closed")],
      mail: [
        facts("quiet", { latestAt: "2026-10-01T05:00:00.000Z" }),
        facts("busy", {
          open: 2,
          latestAt: "2026-09-01T05:00:00.000Z",
          latestOpenKind: "Offer",
        }),
        facts("later", { latestAt: "2026-10-02T05:00:00.000Z" }),
      ],
    });
    expect(result.rows.map((row) => [row.key, row.group])).toEqual([
      ["a", "closed"],
      ["later", "closed"],
      ["quiet", "closed"],
      ["busy", "needs"],
    ]);
    expect(result.rows[3]).toMatchObject({ newCount: 2, signal: "Offer", due: null, next: null });
    expect(result.rows[1].signal).toBe("No application recorded");
  });

  it("counts Needs a home", () => {
    const result = rows({ mail: [facts(null, { open: 2, total: 5 })] });
    expect(result.rows).toEqual([]);
    expect(result.home).toEqual({ open: 2, total: 5 });
  });

  it("narrows to matches", () => {
    const result = rows({
      lanes: [lane("a", "needs"), lane("b", "active")],
      mail: [facts("c")],
      matches: new Map([
        ["b", 3],
        ["c", 1],
      ]),
    });
    expect(result.rows.map((row) => [row.key, row.matches])).toEqual([
      ["b", 3],
      ["c", 1],
    ]);
  });

  it("due tone", () => {
    const result = rows({
      lanes: [
        lane("a", "needs", { next: next("today", "Today, 3:00 pm") }),
        lane("b", "needs", { next: next("overdue", "2 days late") }),
        lane("c", "active", { next: next("week", "Sun") }),
        lane("d", "active", { next: next(null, "Tue") }),
        lane("e", "closed"),
      ],
    });
    expect(result.rows.map((row) => row.due)).toEqual([
      { label: "Today, 3:00 pm", tone: "now" },
      { label: "2 days late", tone: "late" },
      { label: "Sun", tone: "calm" },
      { label: "Tue", tone: "calm" },
      null,
    ]);
  });
});
