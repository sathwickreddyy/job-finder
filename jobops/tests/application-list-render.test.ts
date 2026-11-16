import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildLanes, type LaneSource } from "@/features/applications/lanes";
import { journeyOf } from "@/features/applications/journey";
import { namedStepsOf } from "@/features/applications/named-steps";
import { isOutreach } from "@/features/applications/phase";
import { at, event, record, round, uid, type FixtureRecord } from "./lane-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/applications/record-actions", () => ({ notApplying: vi.fn() }));
const { ApplicationList, pinOpenRow } =
  await import("@/features/applications/views/application-list");

const NOW = at("2026-10-31T10:30:00");
function render(records: (LaneSource | FixtureRecord)[], openId: string | null = null) {
  const lanes = buildLanes({ records, items: [], pending: [], now: NOW, by: "application" });
  const journeys = Object.fromEntries(records.map((item) => [item.id, journeyOf(item)]));
  const namedSteps = Object.fromEntries(
    records
      .filter((item) => !isOutreach(item.source))
      .map((item) => [item.id, namedStepsOf({ typicalLoop: [], ...item }, NOW)]),
  );
  return renderToStaticMarkup(
    createElement(ApplicationList, {
      lanes,
      journeys,
      namedSteps,
      openId,
      detail: createElement("p", { "data-testid": "detail" }, "The open row"),
    }),
  );
}
const company = (name: string) => ({
  company: name,
  companyKey: name.toLowerCase(),
  companyName: name,
});
const unsent = (postedAt: Date | null) =>
  record({ ...company("Corvid"), phase: "Preparing", status: "PREPARING", sentAt: null, postedAt });
const waiting = () => record({ ...company("Brightline"), sentAt: at("2026-10-28T10:00:00") });
function northwind() {
  const id = uid();
  return record({
    id,
    ...company("Northwind"),
    phase: "Closed",
    status: "REJECTED",
    closedReason: "REJECTED",
    sentAt: at("2026-10-02T10:00:00"),
    events: [
      event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-10-03T09:00:00")),
      event(id, "REJECTION_RECEIVED", at("2026-10-07T14:00:00")),
    ],
  });
}

describe("ApplicationList", () => {
  it("names the booked round in the row's stepper", () => {
    const id = uid();
    const html = render([
      record({
        id,
        ...company("ServiceNow"),
        phase: "Interviewing",
        status: "TECHNICAL_INTERVIEW",
        typicalLoop: ["DSA", "LLD"],
        rounds: [round(id, { kind: "DSA", scheduledAt: at("2026-11-02T12:00:00") })],
      }),
    ]);
    const stepper =
      html.match(/<ol[^>]*aria-label="Where this application stands"[\s\S]*?<\/ol>/)?.[0] ?? "";
    expect(stepper).toContain("Round 1 · DSA");
    expect(stepper).toContain("Round 2 · LLD");
    expect(stepper).toContain('aria-current="step"');
    expect(stepper).not.toContain("Interviewing");
  });

  it("shows the requisition beside the role so two openings stay apart", () => {
    const html = render([record({ ...company("ServiceNow"), requisition: "JB0076252" })]);
    expect(html).toMatch(/Senior Engineer[\s\S]*JB0076252/);
  });

  it("groups rows as Needs you, Waiting on them, Closed with counts", () => {
    const html = render([northwind(), waiting(), unsent(at("2026-10-21T09:00:00"))]);
    const needs = html.indexOf("Needs you");
    const active = html.indexOf("Waiting on them");
    const closed = html.indexOf("Closed");
    expect(needs).toBeGreaterThan(-1);
    expect(needs).toBeLessThan(active);
    expect(active).toBeLessThan(closed);
    expect(html).toMatch(/Needs you<\/span><span[^>]*>1</);
    expect(html.indexOf("Corvid")).toBeLessThan(html.indexOf("Brightline"));
    expect(html.indexOf("Brightline")).toBeLessThan(html.indexOf("Northwind"));
  });

  it("names each step, keeps its date in the title and shows one next step per row", () => {
    const html = render([northwind()]);
    for (const text of ["Applied", "Acknowledged", "Rejected", "Offer"])
      expect(html).toContain(text);
    for (const title of ["Applied · 2 Oct", "Acknowledged · 3 Oct", "Rejected · 7 Oct"])
      expect(html).toContain(`title="${title}"`);
    expect(html).toContain("Nothing to do");
  });

  it("opens the requested row in place", () => {
    const open = waiting();
    const html = render([northwind(), open, unsent(null)], open.id);
    expect(html).toContain('aria-expanded="true"');
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    // The open row links back to the closed page; the others open themselves.
    expect(html).toContain('href="/applications"');
    const row = html.indexOf("Brightline");
    const detail = html.indexOf('data-testid="detail"');
    expect(detail).toBeGreaterThan(row);
    expect(detail).toBeLessThan(html.indexOf("Northwind"));
  });

  it("shows Not applying for an unsent record past 14 days", () => {
    const html = render([unsent(at("2026-10-13T09:00:00"))]);
    expect(html).toContain("Posting is 18 days old");
    expect(html).toMatch(/<button[^>]*>Not applying<\/button>/);
  });

  it("collapses Closed when it holds more than five rows", () => {
    const html = render(Array.from({ length: 6 }, northwind));
    expect(html).toMatch(/<details[^>]*>\s*<summary/);
    expect(html).not.toMatch(/<details[^>]*open/);
  });
});

describe("pinOpenRow", () => {
  it("keeps the open row in the group it opened in until it closes", () => {
    const quiet = waiting();
    const lanes = buildLanes({
      records: [quiet, northwind()],
      items: [],
      pending: [],
      now: NOW,
      by: "application",
    });
    expect(lanes.find((lane) => lane.leadId === quiet.id)?.group).toBe("active");
    const pinned = pinOpenRow(lanes, { id: quiet.id, group: "needs" });
    expect(pinned.find((lane) => lane.leadId === quiet.id)?.group).toBe("needs");
    expect(pinned.filter((lane) => lane.leadId !== quiet.id)).toEqual(
      lanes.filter((lane) => lane.leadId !== quiet.id),
    );
    expect(pinOpenRow(lanes, null)).toBe(lanes);
  });
});
