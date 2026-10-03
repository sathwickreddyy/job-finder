import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { formatWhen } from "@/features/applications/dates";
import { StatusPill } from "@/features/applications/views/lane-marks";
import { Timeline } from "@/features/applications/views/timeline";

const NOW = new Date("2026-10-03T10:30:00+05:30");

it("formats times against today in India time", () => {
  expect(formatWhen(new Date("2026-10-03T09:12:00+05:30"), NOW)).toBe("Today, 9:12 am");
  expect(formatWhen(new Date("2026-09-20T16:19:00+05:30"), NOW)).toBe("20 Sept, 4:19 pm");
});

it("lists newest first with a Today divider between booked and past entries", () => {
  const html = renderToStaticMarkup(
    createElement(Timeline, {
      now: NOW,
      entries: [
        {
          key: "a",
          at: new Date("2026-09-20T12:00:00+05:30"),
          tone: "sent",
          label: "Applied",
          detail: "",
          tags: [],
        },
        {
          key: "b",
          at: new Date("2026-10-06T11:00:00+05:30"),
          tone: "upcoming",
          label: "Round 3 · LLD",
          detail: "Low-level design",
          tags: ["SDE II"],
        },
        {
          key: "c",
          at: new Date("2026-10-03T09:12:00+05:30"),
          tone: "mail",
          label: "Round confirmed",
          detail: "",
          tags: [],
          href: "/mail/x",
        },
      ],
    }),
  );
  const order = ["Round 3 · LLD", "Today<", "Round confirmed", "Applied"].map((text) =>
    html.indexOf(text),
  );
  expect(
    order.every((index, position) => index > -1 && (position === 0 || index > order[position - 1])),
  ).toBe(true);
  expect(html).toContain('href="/mail/x"');
  expect(html).toContain("SDE II");
  expect(html).toContain("Low-level design");
});

it("shows an empty history plainly", () => {
  expect(renderToStaticMarkup(createElement(Timeline, { now: NOW, entries: [] }))).toContain(
    "Nothing recorded yet.",
  );
});

it("marks quiet records with the review dot and a test id", () => {
  const html = renderToStaticMarkup(
    createElement(StatusPill, { status: { tone: "quiet", label: "Quiet for 13 days" } }),
  );
  expect(html).toContain('data-testid="lane-status"');
  expect(html).toContain("bg-review");
  expect(html).toContain("Quiet for 13 days");
});
