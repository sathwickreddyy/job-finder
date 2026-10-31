import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { readCompanySearch, SearchLane } from "@/features/mail/company-search";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/mail/workspace-actions", () => ({
  saveCompanyRule: vi.fn(),
  searchCompanyMail: vi.fn(),
  includeDroppedMail: vi.fn(),
}));
const { RulePanel } = await import("@/features/mail/search/rule-panel");
const { RunLanes, IncludedNote } = await import("@/features/mail/search/run-lanes");
const { checkChip } = await import("@/features/mail/search/chips");

type SearchData = Awaited<ReturnType<typeof readCompanySearch>>;
const counts = { fetched: 0, alreadyHere: 0, kept: 0, dropped: 0, newAttention: 0 };
const data: SearchData = {
  rule: {
    company: "Northstar",
    aliases: ["Northstar Labs"],
    domains: ["northstar.example"],
    senders: ["talent@northstar.example"],
    keywords: ["Northstar Talent"],
    excludedTerms: ["Northstar newsletter"],
  },
  ruleSource: "Your saved pattern",
  inboxes: [
    { account: "me@gmail.com", provider: "GMAIL" },
    { account: "me@outlook.in", provider: "OUTLOOK" },
  ],
  lastRun: {
    key: "northstar",
    since: "2026-08-02T04:00:00.000Z",
    until: "2026-10-31T04:00:00.000Z",
    accounts: ["me@gmail.com", "me@outlook.in"],
    startedAt: "2026-10-31T04:00:00.000Z",
    finishedAt: "2026-10-31T04:01:00.000Z",
    counts: { ...counts, fetched: 14, kept: 6, dropped: 6, alreadyHere: 2 },
    ruleHits: { addresses: 5, domains: 1, keywords: 2, never: 1 },
  },
  ruleHits: { addresses: 5, domains: 1, keywords: 2, never: 1 },
  queries: {
    "me@gmail.com": '-in:sent -in:drafts {from:"talent@northstar.example"}',
    "me@outlook.in": '"(from:\\"talent@northstar.example\\")"',
  },
  dropped: [],
};

it("shows each rule with its last-search count", () => {
  const html = renderToStaticMarkup(
    createElement(RulePanel, { data, companyKey: "northstar", companyName: "Northstar" }),
  );
  for (const text of [
    "How we find Northstar&#x27;s mail",
    "Last search 31 Oct, last 90 days: 6 kept, 6 dropped",
    "Addresses",
    "talent@northstar.example",
    "5 kept",
    "Domains",
    "Names and keywords",
    "Northstar Talent",
    "Never include",
    "1 left out",
    "Inboxes",
    "Time frame",
    "Show the exact search sent to each inbox",
    "Search Northstar&#x27;s mail",
  ])
    expect(html).toContain(text);
  expect(html).toContain("from:&quot;talent@northstar.example&quot;");
});

it("refuses a generic keyword with the server copy", () => {
  const rule = { company: "Northstar", existing: [] };
  expect(checkChip("keywords", "  Interview ", rule)).toBe(
    '"Interview" appears in every company\'s mail, so it can\'t identify Northstar. Try a phrase like "Northstar Talent".',
  );
  expect(checkChip("keywords", "Northstar Talent", rule)).toBeNull();
  expect(checkChip("senders", "not an address", rule)).toBe("Enter an email address.");
  expect(checkChip("domains", "northstar", rule)).toBe("Enter a domain like northstar.com.");
  expect(
    checkChip("domains", "northstar.example", { ...rule, existing: ["northstar.example"] }),
  ).toBe("northstar.example is already listed.");
});

it("renders one lane per selected inbox with its query", () => {
  const lanes: SearchLane[] = [
    {
      account: "me@gmail.com",
      provider: "GMAIL",
      state: "done",
      query: "-in:sent -in:drafts {gmail-query}",
      counts: { ...counts, fetched: 3, kept: 1, dropped: 1, alreadyHere: 1 },
      items: [
        {
          trackingId: "t1",
          messageId: null,
          receivedAt: "2026-10-20T04:00:00.000Z",
          sender: "events@example.net",
          senderName: "Events",
          subject: "Northstar meetup",
          folders: ["INBOX"],
          kept: false,
          tag: null,
          reason: "Matched Northstar by company name in subject; no job event recognised",
          companyKeys: ["northstar"],
          evidence: ["Company name in subject"],
        },
      ],
      error: null,
    },
    {
      account: "me@outlook.in",
      provider: "OUTLOOK",
      state: "failed",
      query: "outlook-query",
      counts,
      items: [],
      error: "Sign-in expired",
    },
  ];
  const html = renderToStaticMarkup(
    createElement(RunLanes, {
      lanes,
      pages: { "me@gmail.com": 2, "me@outlook.in": 0 },
      notes: {},
      onInclude: () => {},
      onAddKeyword: () => {},
    }),
  );
  expect(html.match(/<section/g)).toHaveLength(2);
  expect(html).toContain("gmail-query");
  expect(html).toContain("outlook-query");
  expect(html).toContain("3 read");
  expect(html).toContain("1 already here");
  expect(html).toContain("Dropped: Matched Northstar by company name in subject");
  expect(html).toContain("Include this");
  expect(html).toContain("Sign-in expired");
});

it("shows the shared-sender note and keyword offer after Include this", () => {
  const html = renderToStaticMarkup(
    createElement(IncludedNote, {
      company: "Northstar",
      result: {
        addedSender: null,
        skippedShared: "meera.k@gmail.com",
        suggestedKeyword: "Meera K",
      },
      keywordAdded: false,
      onAddKeyword: () => {},
    }),
  );
  expect(html).toContain("meera.k@gmail.com is shared by many companies");
  expect(html).toContain("Add “Meera K” as a keyword");
  const added = renderToStaticMarkup(
    createElement(IncludedNote, {
      company: "Northstar",
      result: { addedSender: "eng@northstar.example", skippedShared: null, suggestedKeyword: null },
      keywordAdded: false,
      onAddKeyword: () => {},
    }),
  );
  expect(added).toContain("Added eng@northstar.example to Northstar&#x27;s addresses.");
});
