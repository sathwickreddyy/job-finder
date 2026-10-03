import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { NextView, SnoozeToast } from "@/features/applications/views/next";
import type { QueueItem } from "@/features/applications/queue";

vi.mock("@/features/applications/record-actions", () => ({
  snoozeQueueItem: vi.fn(),
  unsnoozeQueueItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const silence: QueueItem = {
  key: "silence:00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000001",
  company: "A company with a long name",
  due: "overdue",
  dueAt: new Date("2026-10-01T10:30:00+05:30"),
  reason: "silence",
  title: "A company with a long name has been quiet",
  detail: "SDE II · 9 days quiet, follow up after 7",
  primary: {
    label: "Record follow-up",
    href: "/applications/record?outcome=followup#what-happened",
  },
  secondary: {
    label: "Close as no reply",
    href: "/applications/record?outcome=ghosted#what-happened",
  },
};

it("keeps both real actions and an accessible snooze on an overdue silence item", () => {
  const html = renderToStaticMarkup(
    createElement(NextView, { items: [silence], now: new Date("2026-10-03T12:00:00+05:30") }),
  );
  expect(html).toContain('href="/applications/record?outcome=followup#what-happened"');
  expect(html).toContain('href="/applications/record?outcome=ghosted#what-happened"');
  expect(html).toContain("Close as no reply");
  expect(html).toContain(`aria-label="Snooze ${silence.title} for 2 days"`);
  expect(html).toContain(`value="${silence.key}"`);
});

it("keeps snooze confirmation and undo labelled for assistive technology", () => {
  const html = renderToStaticMarkup(
    createElement(SnoozeToast, { snoozed: { key: silence.key, title: silence.title } }),
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("Snoozed for 2 days:");
  expect(html).toContain(">Undo</button>");
  expect(html).toContain('aria-label="Dismiss snooze confirmation"');
});
