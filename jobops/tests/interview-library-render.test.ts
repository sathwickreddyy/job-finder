import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LibraryRow } from "@/features/interviews/types";
import { LibraryTable } from "@/features/interviews/views/library-table";

const row = (patch: Partial<LibraryRow>): LibraryRow => ({
  id: crypto.randomUUID(),
  roundId: "r1",
  position: 1,
  title: "Two sum",
  patterns: ["Hash map"],
  prompt: "",
  answer: "",
  outcome: "solved_code",
  time: "O(n)",
  space: "O(n)",
  interviewer: "",
  review: "",
  reviewSource: null,
  reviewedAt: null,
  updatedAt: "2026-11-16T10:00:00.000Z",
  applicationId: "a1",
  company: "Northwind",
  role: "Backend Engineer",
  roundLabel: "Round 1 · DSA",
  date: "2026-11-10T06:30:00.000Z",
  ...patch,
});
const render = (rows: LibraryRow[]) => renderToStaticMarkup(createElement(LibraryTable, { rows }));

describe("question library", () => {
  it("invites recording questions when there are none", () => {
    expect(render([])).toContain("Questions you record after interviews appear here.");
  });

  it("lists questions from every company, newest first", () => {
    const html = render([
      row({ company: "Northwind", title: "Older question", date: "2026-11-02T06:30:00.000Z" }),
      row({
        company: "ServiceNow",
        title: "Minimum window substring",
        date: "2026-11-16T06:30:00.000Z",
      }),
    ]);
    expect(html.indexOf("Minimum window substring")).toBeGreaterThan(-1);
    expect(html.indexOf("Minimum window substring")).toBeLessThan(html.indexOf("Older question"));
    expect(html).toContain("ServiceNow");
    expect(html).toContain("Northwind");
  });

  it("marks the sorted column for assistive technology", () => {
    const html = render([row({})]);
    expect(html).toMatch(/<th[^>]*aria-sort="none"[^>]*>[\s\S]*?Company/);
    expect(html).toMatch(/<th[^>]*aria-sort="descending"[^>]*>[\s\S]*?Date/);
  });
});
