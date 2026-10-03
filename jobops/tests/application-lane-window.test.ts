import { describe, expect, it } from "vitest";
import { laneViews, laneWindow, stackDots } from "@/features/applications/lanes";
import { NOW, at, event, lanesFor, record, round, uid } from "./lane-fixtures";

describe("lane window", () => {
  it("runs from two days before the oldest open dot to a week after today, at least two weeks wide", () => {
    const fresh = laneWindow(lanesFor([record({ sentAt: at("2026-10-02T18:30:00") })]), NOW);
    expect(new Date(fresh.end)).toEqual(at("2026-10-11T00:00:00"));
    expect(new Date(fresh.start)).toEqual(at("2026-09-27T00:00:00"));
    const old = laneWindow(lanesFor([record({ sentAt: at("2026-08-28T10:00:00") })]), NOW);
    expect(new Date(old.start)).toEqual(at("2026-08-26T00:00:00"));
  });

  it("clamps months-old open history to twelve weeks with one Earlier stack, ignoring closed lanes", () => {
    const ancient = record({
      companyKey: "a",
      companyName: "A",
      sentAt: at("2026-05-01T10:00:00"),
    });
    const closedOld = record({
      companyKey: "b",
      companyName: "B",
      phase: "Closed",
      status: "REJECTED",
      closedReason: "REJECTED",
      sentAt: at("2026-03-01T10:00:00"),
    });
    const lanes = lanesFor([ancient, closedOld]);
    const window = laneWindow(lanes, NOW);
    expect(new Date(window.start)).toEqual(at("2026-07-19T00:00:00"));
    const lane = lanes.find((item) => item.company === "A")!;
    expect(stackDots(lane.dots, window)[0]).toMatchObject({ pct: 0, earlier: true });
    const view = laneViews(lanes, window, NOW).lanes.find((item) => item.company === "A")!;
    expect(view.stacks[0].label.startsWith("Earlier: ")).toBe(true);
  });

  it("ticks every three days up to three weeks and on Mondays beyond", () => {
    const short = laneWindow(lanesFor([record({ sentAt: at("2026-10-02T18:30:00") })]), NOW);
    expect(short.ticks.map((tick) => new Date(tick))).toEqual(
      ["2026-09-28", "2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"].map((day) =>
        at(`${day}T00:00:00`),
      ),
    );
    const long = laneWindow(lanesFor([record({ sentAt: at("2026-08-28T10:00:00") })]), NOW);
    expect(long.ticks.map((tick) => new Date(tick))).toEqual(
      ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"].map(
        (day) => at(`${day}T00:00:00`),
      ),
    );
  });
});

describe("stacked dots and chart views", () => {
  it("keeps stack preview titles, dates and details separate", () => {
    const id = uid();
    const lanes = lanesFor([
      record({
        id,
        events: [
          event(id, "MANUAL_NOTE", NOW, {
            summary: "Interview preparation saved: ownership and safety",
          }),
        ],
      }),
    ]);
    const [stack] = laneViews(lanes, laneWindow(lanes, NOW), NOW).lanes[0].stacks;
    expect(stack).toMatchObject({
      entries: [
        {
          label: "Note",
          when: "Today, 10:30 am",
          detail: "Interview preparation saved: ownership and safety",
        },
      ],
    });
  });

  it("gives dates beyond the window a separate Later stack with their real dates", () => {
    const id = uid();
    const lanes = lanesFor([
      record({
        id,
        rounds: [
          round(id, { scheduledAt: at("2026-10-10T18:00:00") }),
          round(id, { scheduledAt: at("2026-12-01T11:00:00"), position: 2 }),
          round(id, { scheduledAt: at("2027-01-02T11:00:00"), position: 3 }),
        ],
      }),
    ]);
    const view = laneViews(lanes, laneWindow(lanes, NOW), NOW).lanes[0];
    expect(view.stacks.at(-1)).toMatchObject({ edge: "later", pct: 100, count: 2 });
    expect(view.stacks.at(-1)?.label).toMatch(/^Later: /);
    expect(view.stacks.at(-2)?.count).toBe(1);
  });

  it("stacks dots minutes apart, leads with the more important one and reads out both", () => {
    const id = uid();
    const source = record({
      id,
      sentAt: at("2026-09-20T12:00:00"),
      events: [
        event(id, "APPLICATION_SUBMITTED", at("2026-09-20T12:00:00"), { summary: "Applied" }),
      ],
      linkedMail: [
        {
          id: uid(),
          subject: "We got it",
          classification: "APPLICATION_ACKNOWLEDGEMENT",
          receivedAt: at("2026-09-20T12:05:00"),
        },
      ],
    });
    const lanes = lanesFor([source]);
    const view = laneViews(lanes, laneWindow(lanes, NOW), NOW);
    const [lane] = view.lanes;
    expect(lane.stacks).toHaveLength(1);
    expect(lane.stacks[0]).toMatchObject({ count: 2, tone: "mail" });
    expect(lane.stacks[0].lines).toEqual([
      "Applied, 20 Sept",
      "Automatic “we received it”, 20 Sept (We got it)",
    ]);
    expect(lane.line).toEqual({ from: lane.stacks[0].pct, to: view.today });
    expect(lane.dashed).toBeNull();
  });

  it("dashes the booked future, leaves dateless lanes empty and hides tick labels beside Today", () => {
    const id = uid();
    const booked = record({
      id,
      companyKey: "uber",
      companyName: "Uber",
      phase: "Interviewing",
      status: "TECHNICAL_INTERVIEW",
      sentAt: at("2026-09-28T10:00:00"),
      rounds: [round(id, { kind: "LLD", scheduledAt: at("2026-10-06T11:00:00"), position: 3 })],
    });
    const empty = record({
      companyKey: "quizizz",
      companyName: "Quizizz",
      phase: "Preparing",
      status: "PREPARING",
      sentAt: null,
    });
    const lanes = lanesFor([booked, empty]);
    const view = laneViews(lanes, laneWindow(lanes, NOW), NOW);
    const uber = view.lanes.find((lane) => lane.company === "Uber")!;
    expect(uber.dashed).toEqual({ from: view.today, to: expect.any(Number) });
    expect(uber.stacks.at(-1)).toMatchObject({ tone: "upcoming", lines: ["Round 3 · LLD, 6 Oct"] });
    expect(view.lanes.find((lane) => lane.company === "Quizizz")).toMatchObject({
      stacks: [],
      line: null,
      dashed: null,
    });
    expect(view.ticks.some((tick) => tick.label === null)).toBe(true);
    expect(
      view.ticks
        .filter((tick) => tick.label === null)
        .every((tick) => Math.abs(tick.pct - view.today) <= 5),
    ).toBe(true);
    expect(JSON.stringify(view)).not.toContain("NaN");
  });
});
