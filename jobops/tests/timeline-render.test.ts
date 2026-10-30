import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MailItem } from "@/features/mail/mail-item";
import type { TimelineDay } from "@/features/timeline/entries";
import type { Handling } from "@/features/timeline/suggest";

vi.mock("@/features/mail/workspace-actions", () => ({
  handleMailAction: vi.fn(),
  reopenMailAction: vi.fn(),
  placeMailAction: vi.fn(),
}));
const { CompanyTimeline } = await import("@/features/timeline/timeline");

const item = (id: string, patch: Partial<MailItem> = {}): MailItem => ({
  id,
  account: "me@example.com",
  provider: "GMAIL",
  folders: ["INBOX"],
  receivedAt: "2026-10-31T04:00:00.000Z",
  sender: "priya@northstar.dev",
  senderName: "Priya",
  subject: "Next round",
  text: "Hello",
  company: { key: "northstar", name: "Northstar" },
  application: null,
  tag: "process",
  kind: "Interview",
  attention: "open",
  handledAt: null,
  outcome: null,
  ...patch,
});
const handling: Handling = {
  applications: [{ id: "a", role: "Backend", outcomes: ["heard", "scheduled", "rejected"] }],
  chosen: "a",
  suggested: "scheduled",
  reason: "Suggested for an interview email.",
};
const days: TimelineDay[] = [
  {
    key: "upcoming",
    label: "Coming up",
    entries: [
      {
        type: "step",
        id: "round:1",
        at: "2026-11-03T09:30:00.000Z",
        applicationId: "a",
        eventType: "ROUND_BOOKED",
        text: "DSA round",
        upcoming: true,
      },
    ],
  },
  {
    key: "2026-10-31",
    label: "Today",
    entries: [{ type: "mail", at: "2026-10-31T04:00:00.000Z", item: item("m1"), recorded: null }],
  },
  {
    key: "2026-10-30",
    label: "Fri 30 Oct",
    entries: [
      {
        type: "step",
        id: "e1",
        at: "2026-10-30T05:00:00.000Z",
        applicationId: "a",
        eventType: "APPLICATION_SUBMITTED",
        text: "Applied for Backend",
        upcoming: false,
      },
    ],
  },
];
const role = (id: string, name: string) => ({ id, role: name, href: `/mail?role=${id}` });
const render = (props: Partial<Parameters<typeof CompanyTimeline>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(CompanyTimeline, {
      days,
      handling: { m1: handling },
      roles: [role("a", "Backend")],
      allRolesHref: "/mail",
      role: null,
      openMail: null,
      olderHref: null,
      ...props,
    }),
  );

describe("CompanyTimeline", () => {
  it("renders day headings and rows", () => {
    const html = render();
    for (const heading of ["Coming up", "Today", "Fri 30 Oct"]) expect(html).toContain(heading);
    expect(html).toContain("Needs you");
    expect(html).toContain("Record round scheduled");
    expect(html).toContain("Suggested for an interview email.");
    expect(html).toContain("Applied for Backend");
  });

  it("role chips only with two roles", () => {
    expect(render()).not.toContain('aria-label="Filter by role"');
    const html = render({ roles: [role("a", "Backend"), role("b", "Platform")] });
    expect(html).toContain('aria-label="Filter by role"');
    for (const label of ["All roles", "Backend", "Platform"]) expect(html).toContain(label);
    expect(html).toContain('href="/mail?role=b"');
  });

  it("handled row shows what was recorded", () => {
    const handled = item("m2", { attention: "handled", handledAt: "2026-10-31T05:00:00.000Z" });
    const html = render({
      openMail: "m2",
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          entries: [
            { type: "mail", at: handled.receivedAt, item: handled, recorded: "Round scheduled" },
          ],
        },
      ],
    });
    expect(html).toContain("Recorded: Round scheduled");
    expect(html).not.toContain("Undo");
    expect(html).not.toContain("Needs you");
  });

  it("offers Undo only for just info", () => {
    const handled = item("m3", { attention: "handled", handledAt: "2026-10-31T05:00:00.000Z" });
    const html = render({
      openMail: "m3",
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          entries: [{ type: "mail", at: handled.receivedAt, item: handled, recorded: null }],
        },
      ],
    });
    expect(html).toContain("Marked as just info");
    expect(html).toContain("Undo");
  });

  it("never renders HTML", () => {
    const html = render({
      openMail: "m4",
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          entries: [
            {
              type: "mail",
              at: "2026-10-31T04:00:00.000Z",
              item: item("m4", { text: "<b>x</b>", attention: "handled" }),
              recorded: null,
            },
          ],
        },
      ],
    });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
});
