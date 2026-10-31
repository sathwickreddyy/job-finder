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
  retagMail: vi.fn(),
  restoreMailKind: vi.fn(),
  undoAutoOutcomeAction: vi.fn(),
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
  tag: "interviewCall",
  kind: "Interview",
  attention: "open",
  handledAt: null,
  outcome: null,
  ...patch,
});
const stamp = (weekday: string, day: number, month: string, year = 2026) => ({
  weekday,
  day,
  month,
  year,
  thisYear: year === 2026,
  today: year === 2026 && month === "Oct" && day === 31,
});
const today = stamp("Sat", 31, "Oct");
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
    stamp: null,
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
    stamp: today,
    entries: [{ type: "mail", at: "2026-10-31T04:00:00.000Z", item: item("m1"), recorded: null }],
  },
  {
    key: "2026-10-30",
    label: "Fri 30 Oct",
    stamp: stamp("Fri", 30, "Oct"),
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
    // Open mail reads bold with a blue edge; screen readers hear that it needs you.
    expect(html).toContain(", needs you");
    expect(html).toContain("w-[3px]");
    expect(html).not.toContain("bg-selected/40");
    expect(html).toContain("Record round scheduled");
    expect(html).toContain("Suggested for an interview email.");
    expect(html).toContain("Applied for Backend");
  });

  it("lays days out as one ledger with a date column and a band where an older year starts", () => {
    const old = (id: string, at: string, key: string, label: string, day: number) => ({
      key,
      label,
      stamp: stamp("Thu", day, "Aug", 2025),
      entries: [{ type: "mail" as const, at, item: item(id, { receivedAt: at }), recorded: null }],
    });
    const html = render({
      days: [
        ...days,
        old("m7", "2025-08-21T11:15:00.000Z", "2025-08-21", "Thu 21 Aug 2025", 21),
        old("m8", "2025-08-14T11:15:00.000Z", "2025-08-14", "Thu 14 Aug 2025", 14),
      ],
    });
    expect(html).toContain("rounded-3xl bg-card ring-1 ring-border");
    expect(html).toMatch(/<section[^>]*aria-label="Fri 30 Oct"/);
    expect(html).toMatch(/<h3 class="sr-only">Thu 21 Aug 2025<\/h3>/);
    // The stamp is visual; the hidden heading carries the full date.
    expect(html).toMatch(/aria-hidden="true"[^>]*>(<[^>]+>)*Fri<[\s\S]*?>30<[\s\S]*?>Oct</);
    expect(html.match(/>2025</g)).toHaveLength(1);
    expect(html).not.toContain(">2026<");
  });

  it("aligns tag, sender, subject with a clean preview, then time and inbox", () => {
    const at = "2026-10-31T04:00:00.000Z";
    const junk = item("m5", {
      account: "me@example.com",
      folders: ["Junk Email"],
      attention: "handled",
      text: "Hi Priya,\n\u200c\u00a0\u200c\u00a0\nPlease share slots for Tuesday.",
    });
    const html = render({
      inboxes: ["me@example.com", "you@outlook.in"],
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          stamp: today,
          entries: [{ type: "mail", at, item: junk, recorded: null }],
        },
      ],
    });
    // Columns follow the feed's own width: three when it is medium, four when it is wide.
    expect(html).toMatch(/<ul class="[^"]*@container/);
    expect(html).toContain("@xl:grid-cols-[9rem_9rem_minmax(0,1fr)]");
    expect(html).toContain("@4xl:grid-cols-[9.5rem_10rem_minmax(0,1fr)_auto]");
    expect(html).toContain("Please share slots for Tuesday.");
    expect(html).not.toContain("Hi Priya,");
    expect(html).toContain(">example.com, Junk<");
    expect(html).toContain('title="Found in me@example.com, Junk Email"');
    // A company's own timeline names the sender and their address in the second column.
    expect(html).toMatch(/>Priya<[\s\S]*?>priya@northstar\.dev</);
    const all = render({
      showCompany: true,
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          stamp: today,
          entries: [{ type: "mail", at, item: junk, recorded: null }],
        },
      ],
    });
    expect(all).toMatch(/>Northstar<[\s\S]*?>Priya</);
  });

  it("labels steps in the tag column so they read apart from emails", () => {
    const html = render();
    expect(html).toMatch(/>DSA round</);
    expect(html).toMatch(/>Booked<\/span>/);
    expect(html).toMatch(/>Recorded<\/span>[\s\S]*?Applied for Backend/);
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
          stamp: today,
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

  it("HandledLine offers Undo for an undoable automatic outcome", () => {
    const rejected = (undoable: boolean) =>
      item("m4", {
        tag: "applicationRejected",
        kind: "Rejection",
        attention: "handled",
        handledAt: "2026-10-31T05:00:00.000Z",
        outcome: "rejected",
        autoOutcome: { undoable },
      });
    const html = (undoable: boolean) =>
      render({
        openMail: "m4",
        days: [
          {
            key: "2026-10-31",
            label: "Today",
            stamp: today,
            entries: [
              {
                type: "mail",
                at: rejected(undoable).receivedAt,
                item: rejected(undoable),
                recorded: "Rejected",
              },
            ],
          },
        ],
      });
    expect(html(true)).toContain("Recorded from this email: Rejected");
    expect(html(true)).toMatch(/<button[^>]*type="submit"[^>]*>.*Undo<\/button>/s);
    expect(html(false)).toContain("Recorded from this email: Rejected");
    expect(html(false)).not.toContain("Undo");
  });

  it("HandledLine says an undone automatic outcome was undone, with no Undo", () => {
    const undone = item("m5", {
      tag: "applicationRejected",
      kind: "Rejection",
      attention: "handled",
      handledAt: "2026-10-31T05:00:00.000Z",
      autoOutcome: { undoable: false, undone: true },
    });
    const html = render({
      openMail: "m5",
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          stamp: today,
          entries: [{ type: "mail", at: undone.receivedAt, item: undone, recorded: null }],
        },
      ],
    });
    expect(html).toContain("Undone. Kept on the application as information.");
    expect(html).not.toContain("Marked as just info");
    expect(html).not.toContain("Undo<");
  });

  it("offers Undo only for just info", () => {
    const handled = item("m3", { attention: "handled", handledAt: "2026-10-31T05:00:00.000Z" });
    const html = render({
      openMail: "m3",
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          stamp: today,
          entries: [{ type: "mail", at: handled.receivedAt, item: handled, recorded: null }],
        },
      ],
    });
    expect(html).toContain("Marked as just info");
    expect(html).toContain("Undo");
  });

  it("each row has a pencil outside its toggle", () => {
    const html = render();
    expect(html).toContain('aria-label="Edit tag"');
    const toggles = html.match(/<button[^>]*aria-expanded[\s\S]*?<\/button>/g) ?? [];
    expect(toggles.length).toBeGreaterThan(0);
    for (const toggle of toggles) expect(toggle).not.toContain('aria-label="Edit tag"');
  });

  it("the toggle still names the tag for screen readers", () => {
    const toggle = render().match(/<button[^>]*aria-expanded[\s\S]*?<\/button>/)?.[0];
    expect(toggle).toContain('<span class="sr-only">Interview call, </span>');
  });

  it("never renders HTML", () => {
    const html = render({
      openMail: "m4",
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          stamp: today,
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

  it("clamps a long step to two lines that open in place", () => {
    const long = `Posting date checked: ${"latest publication noted. ".repeat(20)}`;
    const html = render({
      days: [
        {
          key: "2026-10-30",
          label: "Fri 30 Oct",
          stamp: stamp("Fri", 30, "Oct"),
          entries: [
            {
              type: "step",
              id: "e9",
              at: "2026-10-30T05:00:00.000Z",
              applicationId: "a",
              eventType: "APPLICATION_SUBMITTED",
              text: long,
              upcoming: false,
            },
          ],
        },
      ],
    });
    expect(html).toContain("line-clamp-2");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>[\s\S]*Posting date checked/);
    expect(render()).not.toContain("line-clamp-2");
  });
});
