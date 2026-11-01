import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildLanes, type LaneSource } from "@/features/applications/lanes";
import { journeyOf } from "@/features/applications/journey";
import { at, event, record, uid } from "./lane-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/applications/record-actions", () => ({ notApplying: vi.fn() }));
const { ApplicationList, pinOpenRow } =
  await import("@/features/applications/views/application-list");

const NOW = at("2026-10-31T10:30:00");
function render(records: LaneSource[], openId: string | null = null) {
  const lanes = buildLanes({ records, items: [], pending: [], now: NOW, by: "application" });
  const journeys = Object.fromEntries(records.map((item) => [item.id, journeyOf(item)]));
  return renderToStaticMarkup(
    createElement(ApplicationList, {
      lanes,
      journeys,
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

  it("shows the journey dates and one next step per row", () => {
    const html = render([northwind()]);
    for (const text of ["Sent", "2 Oct", "Acknowledged", "3 Oct", "Rejected", "7 Oct", "Offer"])
      expect(html).toContain(text);
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
