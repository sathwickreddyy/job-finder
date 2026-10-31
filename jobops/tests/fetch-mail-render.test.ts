import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/mail/workspace-actions", () => ({
  checkMail: vi.fn(),
  droppedMail: vi.fn(),
  includeDroppedMail: vi.fn(),
}));
const { FetchMail, FetchProgress, DaysField, clampDays, coverageText } =
  await import("@/features/mail/fetch-mail");

const inboxes = [
  { account: "me@gmail.com", provider: "GMAIL" as const },
  { account: "me@outlook.in", provider: "OUTLOOK" as const },
  { account: "me@outlook.com", provider: "OUTLOOK" as const },
];

it("shows the coverage sentence with the last fetch time", () => {
  const html = renderToStaticMarkup(
    createElement(FetchMail, { inboxes, lastFetched: "2026-10-31T02:32:00.000Z" }),
  );
  expect(html).toContain("Fetch new mail");
  expect(html).toContain("Since last fetch");
  expect(html).toContain("Last N days");
  expect(html).toContain(
    "Checks Gmail and both Outlook inboxes, every folder including Spam and Trash, for mail since 31 Oct, 8:02 am.",
  );
  expect(coverageText(inboxes, { days: 30, lastFetched: null })).toBe(
    "Checks Gmail and both Outlook inboxes, every folder including Spam and Trash, for mail from the last 30 days.",
  );
  expect(coverageText([], { lastFetched: null })).toBe("Connect an inbox to fetch mail.");
});

it("clamps above 180 and shows the company search hint", () => {
  expect(clampDays(400)).toEqual({ days: 180, over: true });
  expect(clampDays(0)).toEqual({ days: 1, over: false });
  expect(clampDays(45)).toEqual({ days: 45, over: false });
  const html = renderToStaticMarkup(
    createElement(DaysField, { days: 180, over: true, onChange: () => {} }),
  );
  expect(html).toContain(
    "Fetch reads every message, so it goes back up to 180 days. For older mail, search a company from its page.",
  );
  expect(
    renderToStaticMarkup(createElement(DaysField, { days: 30, over: false, onChange: () => {} })),
  ).not.toContain("search a company");
});

it("renders one progress row per inbox and the failure text", () => {
  const html = renderToStaticMarkup(
    createElement(FetchProgress, {
      lanes: [
        { account: "me@gmail.com", state: "reading", page: 2, kept: 1, error: null },
        { account: "me@outlook.in", state: "done", page: 3, kept: 4, error: null },
        { account: "me@outlook.com", state: "failed", page: 1, kept: 0, error: "Sign-in expired" },
      ],
    }),
  );
  expect(html.match(/<li/g)).toHaveLength(3);
  expect(html).toContain("Page 2");
  expect(html).toContain("Done, 4 kept");
  expect(html).toContain("Sign-in expired");
});
