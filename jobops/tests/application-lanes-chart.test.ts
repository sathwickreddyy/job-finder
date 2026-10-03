import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { laneViews, laneWindow } from "@/features/applications/lanes";
import { LanesChart } from "@/features/applications/views/lanes";
import { NOW, at, event, lanesFor, record, uid } from "./lane-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function chart() {
  const id = uid();
  const quiet = record({
    id,
    company: "Flipkart",
    companyKey: "flipkart",
    companyName: "Flipkart",
    sentAt: at("2026-09-20T12:00:00"),
    events: [event(id, "APPLICATION_SUBMITTED", at("2026-09-20T12:00:00"), { summary: "Applied" })],
    linkedMail: [
      {
        id: uid(),
        subject: "We got it",
        classification: "APPLICATION_ACKNOWLEDGEMENT",
        receivedAt: at("2026-09-20T12:05:00"),
      },
    ],
  });
  const draft = record({
    companyKey: "quizizz",
    companyName: "Quizizz",
    phase: "Preparing",
    status: "PREPARING",
    sentAt: null,
  });
  const closed = record({
    companyKey: "nutanix",
    companyName: "Nutanix",
    phase: "Closed",
    status: "REJECTED",
    closedReason: "REJECTED",
  });
  const lanes = lanesFor([quiet, draft, closed]);
  return { quiet, closed, lanes, view: laneViews(lanes, laneWindow(lanes, NOW), NOW) };
}

it("draws each open company as a labelled lane with status, dots, Today and its next step", () => {
  const { quiet, view } = chart();
  const html = renderToStaticMarkup(
    createElement(LanesChart, { ...view, openKey: null, detail: null }),
  );
  expect(html).toContain('role="group" aria-label="Flipkart"');
  expect(html).toContain("Quiet for 13 days");
  expect(html).toContain(">Today<");
  expect(html).toContain(`href="/applications?open=${quiet.id}&amp;outcome=followup"`);
  expect(html).toContain(
    'aria-label="Applied, 20 Sept; Automatic “we received it”, 20 Sept (We got it)"',
  );
  expect(html).toContain('data-testid="lanes-chart"');
  expect(html).toContain("Closed · 1");
  expect(html).not.toContain('aria-label="Nutanix"');
  expect(html).not.toContain("NaN");
});

it("shows a closed lane when it is the open one, with its detail underneath", () => {
  const { lanes, view } = chart();
  const nutanix = lanes.find((lane) => lane.company === "Nutanix")!;
  const html = renderToStaticMarkup(
    createElement(LanesChart, {
      ...view,
      openKey: nutanix.key,
      detail: createElement("p", null, "DETAIL"),
    }),
  );
  expect(html).toContain('aria-label="Nutanix"');
  expect(html).toContain("DETAIL");
  expect(html).toMatch(/<a aria-expanded="true"[^>]*href="\/applications"/);
});
