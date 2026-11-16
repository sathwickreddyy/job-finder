import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { buildLanes } from "@/features/applications/lanes";
import { journeyOf } from "@/features/applications/journey";
import { at, event, record } from "./lane-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/applications/record-actions", () => ({ notApplying: vi.fn() }));
const { MobileApplicationList } = await import("@/features/applications/views/application-list");

it("keeps active and closed applications in one list of links", () => {
  const active = record({ company: "Cedar", companyKey: "cedar", companyName: "Cedar" });
  const ended = record({
    company: "Fable",
    companyKey: "fable",
    companyName: "Fable",
    status: "REJECTED",
    phase: "Closed",
    closedReason: "REJECTED",
  });
  ended.events.push(event(ended.id, "REJECTION_RECEIVED", at("2026-10-04T10:00:00")));
  const records = [active, ended];
  const lanes = buildLanes({
    records,
    items: [],
    pending: [],
    now: at("2026-10-05T10:00:00"),
    by: "application",
  });
  const html = renderToStaticMarkup(
    createElement(MobileApplicationList, {
      lanes,
      journeys: Object.fromEntries(records.map((row) => [row.id, journeyOf(row)])),
    }),
  );
  expect(html).toContain("Cedar");
  expect(html).toContain("Fable");
  expect(html).not.toContain("<details");
  expect(html).not.toContain('aria-label="Closed"');
  expect(html).not.toContain('aria-label="Needs you"');
  expect(html).toContain(`href="/applications/${ended.id}"`);
  expect(html).not.toContain("aria-expanded");
  expect(html).toContain("Rejected");
  expect(html).toContain("4 Oct");
});
