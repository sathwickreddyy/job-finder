import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/mail/workspace-actions", () => ({
  checkMail: vi.fn(),
  droppedMail: vi.fn(),
  includeDroppedMail: vi.fn(),
}));
const { FetchMail, DaysField, clampDays, coverageText } =
  await import("@/features/mail/fetch-mail");
const { FetchLanes } = await import("@/features/mail/fetch-dialog");

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

const counts = { fetched: 0, alreadyHere: 0, kept: 0, dropped: 0, newAttention: 0 };
const lane = {
  provider: "OUTLOOK" as const,
  pages: 0,
  counts,
  calls: [],
  usage: null,
  since: null,
  until: null,
  error: null,
  retryAt: null,
};

it("renders one lane per inbox with its state, counts, quota and requests", () => {
  const html = renderToStaticMarkup(
    createElement(FetchLanes, {
      running: true,
      now: Date.parse("2026-11-01T07:26:00Z"),
      lanes: [
        {
          ...lane,
          account: "me@gmail.com",
          provider: "GMAIL",
          state: "waiting",
          pages: 8,
          counts: { ...counts, fetched: 200, kept: 4, dropped: 196 },
          retryAt: "2026-11-01T07:27:00.000Z",
          error: "Gmail rate limit reached (rateLimitExceeded). Paused until 12:57 pm.",
          usage: {
            unit: "quota units",
            limit: 15_000,
            window: "minute",
            recent: 1310,
            today: 4820,
            callsToday: 964,
            rateLimitedToday: 4,
            cooldown: { until: "2026-11-01T07:27:00.000Z", reason: "rateLimitExceeded" },
            spacingMs: 500,
          },
          calls: [
            {
              at: "2026-11-01T07:25:58.000Z",
              label: "List messages",
              request: "GET messages?q=-in:sent -in:drafts before:1&maxResults=25",
              units: 5,
              status: 429,
              ms: 120,
              reason: "rateLimitExceeded: too many requests at once",
            },
          ],
        },
        { ...lane, account: "me@outlook.in", state: "done", pages: 3 },
        { ...lane, account: "me@outlook.com", state: "failed", error: "Sign-in expired" },
      ],
    }),
  );
  expect(html.match(/<li class="grid gap-2.5/g)).toHaveLength(3);
  expect(html).toContain("gmail.com");
  expect(html).toContain("Paused until 12:57 pm · 1:00");
  expect(html).toContain("Read 200 · already here 0 · kept 4 · dropped 196");
  expect(html).toContain(
    "1,310</span> of 15,000 quota units in the last minute · 4,820 today across 964 requests",
  );
  expect(html).toContain("GET messages?q=-in:sent -in:drafts before:1&amp;maxResults=25");
  expect(html).toContain("Refused: rateLimitExceeded: too many requests at once.");
  expect(html).toContain("Paused this inbox instead of asking again.");
  expect(html).toContain("Slowed to one request every 500 ms after a refusal");
  expect(html).toContain("Done, 3 pages");
  expect(html).toContain("Sign-in expired");
});
