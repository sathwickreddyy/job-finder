import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Journey } from "@/features/applications/journey";
import { JourneyTrack } from "@/features/applications/views/journey-track";

const journey: Journey = {
  kind: "application",
  steps: [
    { label: "Sent", at: new Date("2026-10-03T06:00:00Z"), state: "reached", tone: "applied" },
    { label: "Acknowledged", at: null, state: "ahead", tone: "applied" },
    { label: "Interviewing", at: null, state: "ahead", tone: "interviewing" },
    { label: "Offer", at: null, state: "ahead", tone: "offer" },
  ],
};
const connectors = (size: "row" | "large") =>
  renderToStaticMarkup(createElement(JourneyTrack, { journey, size })).match(
    /<span aria-hidden="true" class="absolute[^"]*"/g,
  ) ?? [];

describe("JourneyTrack", () => {
  it("draws each connector between circle edges, never over a circle", () => {
    // A row circle is 24px and a large one 28px: half of it plus a 4px gap on each side.
    const row = connectors("row");
    expect(row).toHaveLength(3);
    for (const line of row) {
      expect(line).toContain("left-[calc(-50%+16px)]");
      expect(line).toContain("right-[calc(50%+16px)]");
    }
    for (const line of connectors("large")) {
      expect(line).toContain("left-[calc(-50%+18px)]");
      expect(line).toContain("right-[calc(50%+18px)]");
    }
  });
});
