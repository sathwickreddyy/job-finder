import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MailItem } from "@/features/mail/mail-item";
import type { MailViewData } from "@/features/timeline/mail-data";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/mail/workspace-actions", () => ({
  checkMail: vi.fn(),
  droppedMail: vi.fn(),
  includeDroppedMail: vi.fn(),
  handleMailAction: vi.fn(),
  placeMailAction: vi.fn(),
  reopenMailAction: vi.fn(),
  saveWorkspaceRule: vi.fn(),
}));
const { MailView } = await import("@/features/timeline/mail-view");

const data = (patch: Partial<MailViewData> = {}): MailViewData => ({
  query: {
    company: null,
    home: false,
    all: false,
    tag: null,
    q: null,
    role: null,
    mail: null,
    cursor: null,
  },
  index: {
    rows: [
      {
        key: "lumen",
        name: "Lumen",
        slug: null,
        group: "waiting",
        signal: "Follow up if it stays quiet",
        next: "Follow up if it stays quiet",
        due: { label: "Sun", tone: "calm" },
        newCount: 0,
        matches: null,
        latestAt: null,
      },
    ],
    home: { open: 0, total: 0, matches: null },
  },
  pinned: false,
  pane: { kind: "empty" },
  placeOptions: { companies: [], applications: [] },
  inboxes: {
    connections: [
      {
        id: "c1",
        provider: "GMAIL",
        email: "me@example.com",
        lastChecked: "2026-10-31T04:00:00.000Z",
        lastError: null,
      },
    ],
    configs: [],
    coverage: [],
  },
  lastChecked: "2026-10-31T04:00:00.000Z",
  notice: null,
  comingUp: [],
  statuses: {},
  ...patch,
});
const mail = (patch: Partial<MailItem> = {}): MailItem => ({
  id: "m1",
  account: "me@outlook.in",
  provider: "OUTLOOK",
  folders: ["Inbox"],
  receivedAt: "2026-10-31T04:00:00.000Z",
  sender: "talent@lumen.example",
  senderName: "Lumen Talent",
  subject: "Interview invitation",
  text: "Please share your availability this week.\nThanks, Lumen",
  company: { key: "lumen", name: "Lumen" },
  application: null,
  tag: "interviewCall",
  kind: "Interview",
  attention: "open",
  handledAt: null,
  outcome: null,
  ...patch,
});
const noTags = {
  application: 0,
  referral: 0,
  interviewCall: 1,
  interviewProcess: 0,
  offer: 0,
  rejection: 0,
  backgroundCheck: 0,
  joining: 0,
  opportunity: 0,
  other: 0,
};
const allPane = (items: MailItem[]): MailViewData["pane"] => ({
  kind: "all",
  days: [
    {
      key: "2026-10-31",
      label: "Today",
      stamp: { weekday: "Sat", day: 31, month: "Oct", year: 2026, thisYear: true, today: true },
      entries: items.map((item) => ({
        type: "mail" as const,
        at: item.receivedAt,
        item,
        recorded: null,
      })),
    },
  ],
  handling: {},
  olderHref: null,
  newestHref: null,
  tags: noTags,
});
const render = (value: MailViewData) =>
  renderToStaticMarkup(createElement(MailView, { data: value }));

describe("MailView", () => {
  it("says nothing needs you with the last fetch and Fetch new mail", () => {
    const html = render(data());
    expect(html).toContain("Nothing needs you");
    expect(html).toContain("Fetch new mail");
    expect(html).toContain("for mail since 31 Oct, 9:30 am.");
    expect(html).toContain("Waiting on them");
    expect(html).not.toContain(">Needs you<");
  });

  it("says no mail matches while filtered", () => {
    const html = render(
      data({
        query: { ...data().query, q: "nothing" },
        index: { rows: [], home: { open: 0, total: 0, matches: 0 } },
      }),
    );
    expect(html).toContain("No mail matches");
    expect(html).not.toContain("Nothing needs you");
  });

  it("shows a notice from the URL", () => {
    expect(render(data({ notice: "Gmail could not be verified." }))).toContain(
      "Gmail could not be verified.",
    );
  });

  it("keeps the rail on a phone when the URL named no company", () => {
    const html = render(data({ query: { ...data().query, company: "lumen" }, pinned: false }));
    expect(html).toMatch(/<div class="min-w-0"><nav aria-label="Companies"/);
    const pinned = render(data({ query: { ...data().query, company: "lumen" }, pinned: true }));
    expect(pinned).toMatch(/<div class="min-w-0 hidden md:block"><nav aria-label="Companies"/);
  });

  it("counts open mail in Needs a home", () => {
    const html = render(data({ index: { rows: [], home: { open: 1, total: 5, matches: null } } }));
    expect(html).toContain("1 email to place");
    expect(html).not.toContain("5 emails to place");
    const handled = render(
      data({ index: { rows: [], home: { open: 0, total: 3, matches: null } } }),
    );
    expect(handled).toContain("Nothing to place");
    expect(handled).toContain("3 handled");
  });

  it("defaults to All job mail", () => {
    const html = render(data({ pane: allPane([mail()]) }));
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?All job mail/);
    expect(html).toContain("<h2");
    expect(html).toContain("Interview invitation");
  });

  it("renders two-line rows with the source chip and a Junk highlight", () => {
    const html = render(
      data({ pane: allPane([mail({ folders: ["Junk Email"], account: "me@outlook.in" })]) }),
    );
    expect(html).toContain("Lumen");
    expect(html).toContain("Lumen Talent");
    expect(html).toContain("Interview call");
    expect(html).toContain("Please share your availability this week.");
    expect(html).not.toContain("Thanks, Lumen</span>");
    expect(html).toMatch(/bg-warning-soft[^"]*"[^>]*>[\s\S]*?outlook\.in, Junk</);
    const inbox = render(data({ pane: allPane([mail({ folders: ["Inbox"] })]) }));
    expect(inbox).not.toContain("bg-warning-soft");
  });

  it("renders Coming up soonest first with No date last", () => {
    const html = render(
      data({
        pane: allPane([mail()]),
        comingUp: [
          {
            id: "a",
            at: "2026-11-02T05:30:00.000Z",
            label: "Mon 2 Nov",
            title: "Onsite loop",
            companyKey: "lumen",
            companyName: "Lumen",
            tag: null,
            mailId: null,
          },
          {
            id: "b",
            at: "2026-10-31T09:00:00.000Z",
            label: "Today",
            title: "Online assessment due",
            companyKey: "orbit",
            companyName: "Orbit",
            tag: "interviewCall",
            mailId: null,
          },
          {
            id: "c",
            at: null,
            label: "No date",
            title: "Reply to recruiter",
            companyKey: "quill",
            companyName: "Quill",
            tag: "opportunity",
            mailId: "m9",
          },
        ],
      }),
    );
    expect(html).toContain("Coming up");
    const order = ["Online assessment due", "Onsite loop", "Reply to recruiter"].map((title) =>
      html.indexOf(title),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.indexOf("No date")).toBeGreaterThan(html.indexOf("Mon 2 Nov"));
  });

  it("shows a status pill on rail rows and a collapsed Previous employers group", () => {
    const html = render(
      data({
        index: {
          rows: [
            { ...data().index.rows[0] },
            {
              key: "amazon",
              name: "Amazon",
              slug: null,
              group: "previous",
              signal: "Joined Apr 2022",
              next: null,
              due: null,
              newCount: 0,
              matches: null,
              latestAt: null,
            },
          ],
          home: { open: 0, total: 0, matches: null },
        },
        statuses: {
          lumen: { tone: "quiet", label: "Quiet", detail: "Quiet for 9 days", previous: null },
          amazon: {
            tone: "mailOnly",
            label: "Mail only",
            detail: "Mail only",
            previous: { role: "SDE I", joined: "2022-04", left: "2024-01" },
          },
        },
      }),
    );
    expect(html).toContain("Quiet");
    expect(html).toMatch(/<details class="group">[\s\S]*?Previous employers/);
  });
});
