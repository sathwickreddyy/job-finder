import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MailItem } from "@/features/mail/mail-item";
import type { applicationRounds } from "@/db/schema";
import type { TimelineDay, TimelineRound } from "@/features/timeline/entries";
import type { Handling } from "@/features/timeline/suggest";

vi.mock("@/features/applications/record-actions", () => ({
  updateRound: vi.fn(),
  recordAsSent: vi.fn(),
}));
vi.mock("@/features/applications/outcomes", () => ({ recordOutcome: vi.fn() }));
vi.mock("@/features/mail/workspace-actions", () => ({
  handleMailAction: vi.fn(),
  reopenMailAction: vi.fn(),
  placeMailAction: vi.fn(),
  retagMail: vi.fn(),
  restoreMailKind: vi.fn(),
  undoAutoOutcomeAction: vi.fn(),
}));
type RoundRow = typeof applicationRounds.$inferSelect;
const { CompanyTimeline } = await import("@/features/timeline/timeline");
const { isShown } = await import("@/features/timeline/timeline");
const { RoundCard, notesSummary } = await import("@/features/timeline/round-card");

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
  applications: [
    { id: "a", role: "Backend", requisition: null, outcomes: ["heard", "scheduled", "rejected"] },
  ],
  chosen: "a",
  suggested: "scheduled",
  reason: "Suggested for an interview email.",
};
const days: TimelineDay[] = [
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
    for (const heading of ["Today", "Fri 30 Oct"]) expect(html).toContain(heading);
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
    expect(html).not.toContain("Coming up");
    expect(html.match(/>Recorded</g)).toHaveLength(1);
    expect(html).toMatch(/>Recorded<\/span>[\s\S]*?Applied for Backend/);
    expect(html).toContain('id="entry-e1"');
    expect(html).toContain('id="mail-m1"');
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

  it("says a copy of an email in another inbox was settled, with Undo", () => {
    const copy = item("m6", {
      attention: "handled",
      handledAt: "2026-10-31T05:00:00.000Z",
      copyOf: { account: "me@example.com" },
    });
    const html = render({
      openMail: "m6",
      days: [
        {
          key: "2026-10-31",
          label: "Today",
          stamp: today,
          entries: [{ type: "mail", at: copy.receivedAt, item: copy, recorded: null }],
        },
      ],
    });
    expect(html).toContain("Same email as in me@example.com");
    expect(html).not.toContain("Marked as just info");
    expect(html).toContain("Undo");
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

  it("each row has a pencil outside the button that opens it", () => {
    const html = render();
    expect(html).toContain('aria-label="Edit tag"');
    const toggles = html.match(/<button[^>]*data-mail-row[\s\S]*?<\/button>/g) ?? [];
    expect(toggles.length).toBeGreaterThan(0);
    for (const toggle of toggles) expect(toggle).not.toContain('aria-label="Edit tag"');
  });

  it("the row button still names the tag for screen readers", () => {
    const toggle = render().match(/<button[^>]*data-mail-row[\s\S]*?<\/button>/)?.[0];
    expect(toggle).toContain('<span class="sr-only">Interview call, </span>');
  });

  it("opens emails in a popup instead of expanding rows", () => {
    const closed = render();
    expect(closed).not.toMatch(/<button[^>]*aria-expanded[^>]*data-mail-row/);
    expect(closed).not.toMatch(/data-mail-row[^>]*aria-expanded/);
    expect(closed).not.toContain("<dialog");
    const linked = render({ openMail: "m1" });
    expect(linked).toMatch(
      /<dialog[^>]*aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"[^>]*>Next round<\/h2>/,
    );
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
            },
          ],
        },
      ],
    });
    expect(html).toContain("line-clamp-2");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>[\s\S]*Posting date checked/);
    expect(render()).not.toContain("line-clamp-2");
  });

  describe("one application", () => {
    const entry = (patch: Partial<RoundRow> = {}): TimelineRound => ({
      type: "round",
      at: "2026-10-30T08:30:00.000Z",
      label: "Round 1 · DSA",
      round: {
        id: "r1",
        applicationId: "a",
        kind: "DSA",
        name: "",
        scheduledAt: new Date("2026-10-30T08:30:00.000Z"),
        outcome: "SCHEDULED",
        position: 1,
        notes: "Panel liked the **graph** answer",
        interviewer: "Asha Rao",
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
        updatedAt: new Date("2026-10-20T00:00:00.000Z"),
        ...patch,
      },
    });
    const question = {
      id: "q1",
      roundId: "r1",
      position: 1,
      title: "Merge intervals",
      patterns: [],
      prompt: "",
      answer: "",
      outcome: null,
      time: "",
      space: "",
      interviewer: "",
      review: "",
      reviewSource: null,
      reviewedAt: null,
      updatedAt: "2026-10-30T09:00:00.000Z",
    };
    const data = {
      recordId: "a",
      questions: [question],
      today: "2026-10-31",
    };
    const stepDay: TimelineDay = {
      key: "2026-10-30",
      label: "Fri 30 Oct",
      stamp: stamp("Fri", 30, "Oct"),
      entries: [
        entry(),
        {
          type: "step",
          id: "e2",
          at: "2026-10-30T06:30:00.000Z",
          applicationId: "a",
          eventType: "APPLICATION_SUBMITTED",
          text: "Applied",
        },
      ],
    };
    const mailDay = days[0];
    const one = (props: Partial<Parameters<typeof CompanyTimeline>[0]> = {}) =>
      render({
        days: [mailDay, stepDay],
        requisition: "REQ-0001",
        roundCards: { r1: data },
        roles: [],
        ...props,
      });

    it("replaces role chips with All, Stages and Mail", () => {
      const html = one({ roles: [role("a", "Backend"), role("b", "Platform")] });
      expect(html).not.toContain('aria-label="Filter by role"');
      expect(html).toMatch(/aria-label="Filter timeline"[\s\S]*>All<[\s\S]*>Stages<[\s\S]*>Mail</);
    });

    it("marks the filter pressed state and puts New on open mail only", () => {
      const html = one({
        days: [
          {
            ...mailDay,
            entries: [
              ...mailDay.entries,
              {
                type: "mail",
                at: "2026-10-31T03:00:00.000Z",
                item: item("m2", { attention: "handled" }),
                recorded: null,
              },
            ],
          },
          stepDay,
        ],
      });
      expect(html).toMatch(/aria-label="Filter timeline"[\s\S]*aria-pressed="true"[^>]*>All</);
      expect(html.match(/aria-label="New"/g)).toHaveLength(1);
      expect(html.indexOf('aria-label="New"')).toBeLessThan(html.indexOf('id="mail-m2"'));
    });

    it("renders the toolbar and composer slots around the feed", () => {
      const html = one({
        toolbarEnd: createElement("i", { id: "tb" }),
        children: createElement("i", { id: "cmp" }),
      });
      expect(html.indexOf('id="tb"')).toBeGreaterThan(html.indexOf("Filter timeline"));
      expect(html.indexOf('id="cmp"')).toBeGreaterThan(html.indexOf('id="tb"'));
      expect(html.indexOf('id="cmp"')).toBeLessThan(html.indexOf('id="mail-m1"'));
    });

    it("shows steps with Recorded once, the time under it, and the requisition", () => {
      const html = one();
      expect(html).toContain('id="entry-e2"');
      expect(html.match(/>Recorded</g)).toHaveLength(1);
      expect(html).toMatch(/>Recorded<\/span><\/span><span[^>]*>12:00 pm</);
      expect(html).toContain(">REQ-0001<");
    });

    it("shows a round card with interviewer, question count and result", () => {
      const html = one();
      expect(html).toContain('id="round-r1"');
      for (const text of ["Asha Rao", "Round 1 · DSA", "1 question", "Result due"])
        expect(html).toContain(text);
      expect(html).not.toContain("Merge intervals");
    });

    it("says when no interviewer was recorded", () => {
      expect(one({ roundCards: { r1: data } })).toContain("Asha Rao");
      const html = renderToStaticMarkup(
        createElement(RoundCard, {
          entry: entry({ interviewer: "" }),
          data,
        }),
      );
      expect(html).toContain("Interviewer not recorded");
    });

    it("opened, lists the questions and the round notes with no result buttons", () => {
      const html = renderToStaticMarkup(
        createElement(RoundCard, { entry: entry(), data, defaultOpen: true, requisition: null }),
      );
      expect(html).toContain("Merge intervals");
      expect(html).toContain("<strong>graph</strong>");
      expect(html).toContain("Questions · 1");
      expect(html).toContain("Round notes");
      expect(html).toContain("Edit round");
      expect(html).toContain("No requisition");
      for (const label of ["Cleared the round", "Didn&#x27;t clear it", "Rescheduled", "Rejected"])
        expect(html.replace(/&#39;/g, "&#x27;")).not.toContain(label);
    });

    it("labels results Booked, Cleared and Didn't clear", () => {
      const text = (patch: Partial<RoundRow>) =>
        renderToStaticMarkup(createElement(RoundCard, { entry: entry(patch), data }));
      expect(text({ scheduledAt: new Date("2999-01-01T00:00:00Z") })).toContain(">Booked<");
      expect(text({ outcome: "PASSED" })).toContain(">Cleared<");
      expect(text({ outcome: "FAILED" })).toContain("Didn&#x27;t clear");
    });

    it("tags emails, steps and rounds with the requisition, or No requisition", () => {
      expect(one().match(/>REQ-0001</g)).toHaveLength(3);
      expect(one({ requisition: null }).match(/>No requisition</g)).toHaveLength(3);
      expect(render()).not.toContain("No requisition");
    });

    it("filters: Stages keeps steps and rounds, Mail keeps emails only", () => {
      const m = days[0].entries[0];
      const step = stepDay.entries[1];
      const r = stepDay.entries[0];
      const result = (filter: "all" | "stages" | "mail") =>
        [m, step, r].map((entry) => isShown(entry, filter, true));
      expect(result("all")).toEqual([true, true, true]);
      expect(result("stages")).toEqual([false, true, true]);
      expect(result("mail")).toEqual([true, false, false]);
      expect(isShown(r, "all", false)).toBe(false);
    });

    it("shows the first line of the round notes as a summary", () => {
      expect(notesSummary("\n## **Went** well with [graphs](http://x)\nmore")).toBe(
        "Went well with graphs",
      );
      const html = renderToStaticMarkup(createElement(RoundCard, { entry: entry(), data }));
      expect(html).toContain("Panel liked the graph answer");
      const none = renderToStaticMarkup(
        createElement(RoundCard, { entry: entry({ notes: "" }), data }),
      );
      expect(none).not.toContain("Panel liked");
      expect(none).not.toMatch(/1 question<\/span><span/);
    });

    it("hides a round without card data", () => {
      expect(one({ roundCards: {} })).not.toContain("round-r1");
    });
  });
});
