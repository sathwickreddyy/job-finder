import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { autoOutcomeOf } from "@/features/applications/journey";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { namedStepsOf } from "@/features/applications/named-steps";
import { availableOutcomes, recordStateFrom, type OutcomeId } from "@/features/applications/phase";
import type { ApplicationRecord } from "@/features/applications/read";
import type { CompanyApplicationRow, CompanyApplications } from "@/features/companies/applications";
import type { CompanySummary } from "@/features/companies/summary";
import type { MailItem } from "@/features/mail/mail-item";
import type { TimelineDay } from "@/features/timeline/entries";
import { at, event, record, round, uid } from "./lane-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/applications/record-actions", () => ({
  notApplying: vi.fn(),
  reopenRecord: vi.fn(),
  saveApplicationNotes: vi.fn(),
  setFollowUp: vi.fn(),
  recordAsSent: vi.fn(),
  updateApplicationDetails: vi.fn(),
  updateRound: vi.fn(),
}));
vi.mock("@/features/applications/tracking-actions", () => ({ recordAction: vi.fn() }));
vi.mock("@/features/applications/outcomes", () => ({ recordOutcome: vi.fn() }));
vi.mock("@/features/mail/triage-actions", () => ({ linkMailOnly: vi.fn(), unlinkMail: vi.fn() }));
vi.mock("@/features/mail/workspace-actions", () => ({
  handleMailAction: vi.fn(),
  reopenMailAction: vi.fn(),
  placeMailAction: vi.fn(),
  retagMail: vi.fn(),
  restoreMailKind: vi.fn(),
  undoAutoOutcomeAction: vi.fn(),
  saveCompanyRule: vi.fn(),
  searchCompanyMail: vi.fn(),
  includeDroppedMail: vi.fn(),
}));
const { ApplicationsTab } = await import("@/features/companies/views/applications-tab");
const { DetailHeader, detailTabs, tabAliases } = await import("@/features/companies/detail");
const { MinimalCompanyPage } = await import("@/features/companies/views/minimal-company");
const { companyPageHref } = await import("@/features/applications/navigation");

const NOW = at("2026-11-16T10:30:00");
const resume = { id: "00000000-0000-4000-8000-0000000000aa", filename: "cv.pdf", label: "v3" };

function application(patch: Partial<ApplicationRecord> = {}) {
  const base = record({
    status: "TECHNICAL_INTERVIEW",
    phase: "Interviewing",
    sentAt: at("2026-11-04T10:00:00"),
    ...patch,
  });
  const id = base.id;
  const full = {
    ...base,
    companyHref: "/companies/oracle",
    requisition: "JB0076231",
    appliedAt: base.sentAt,
    applicationUrl: null,
    notes: "",
    resumeVersionId: resume.id,
    resume,
    jobUrl: "https://example.com/job",
    postedAtKind: null,
    linkedIds: [],
    latest: null,
    events: [event(id, "APPLICATION_SUBMITTED", base.sentAt ?? NOW)],
    ...patch,
  } as unknown as ApplicationRecord;
  return full;
}

function rowFor(
  full: ApplicationRecord,
  days: TimelineDay[] = [],
  patch: Partial<CompanyApplicationRow> = {},
): CompanyApplicationRow {
  const outcomes = availableOutcomes(
    recordStateFrom(
      full,
      full.rounds,
      full.events.map((item) => item.eventType),
    ),
  );
  return {
    record: full,
    steps: namedStepsOf(full, NOW),
    days,
    handling: {},
    olderHref: null,
    roundCards: {},
    scores: null,
    outcomes: outcomes as OutcomeId[],
    ...patch,
  };
}

const stepDay = (applicationId: string, text: string): TimelineDay[] => [
  {
    key: "2026-11-04",
    label: "Wed 4 Nov",
    stamp: { weekday: "Wed", day: 4, month: "Nov", year: 2026, thisYear: true, today: false },
    entries: [
      {
        type: "step",
        id: uid(),
        at: at("2026-11-04T10:00:00").toISOString(),
        applicationId,
        eventType: "APPLICATION_SUBMITTED",
        text,
      },
    ],
  },
];

const mailItem = (id: string, subject: string, applicationId: string | null): MailItem => ({
  id,
  account: "me@example.com",
  provider: "GMAIL",
  folders: [],
  receivedAt: at("2026-11-05T09:00:00").toISOString(),
  sender: "talent@example.com",
  senderName: "Talent",
  subject,
  text: "Hello",
  company: { key: "oracle", name: "Oracle" },
  application: applicationId ? { id: applicationId, role: "Engineer" } : null,
  tag: "application",
  kind: "Application update",
  attention: "handled",
  handledAt: null,
  outcome: null,
});
const mailDay = (item: MailItem): TimelineDay[] => [
  {
    ...stepDay("x", "")[0],
    key: "2026-11-05",
    entries: [{ type: "mail", at: item.receivedAt, item, recorded: null }],
  },
];

function data(rows: CompanyApplicationRow[], patch: Partial<CompanyApplications> = {}) {
  return {
    rows,
    unplaced: [],
    unplacedHandling: {},
    unplacedOlderHref: null,
    next: null,
    status: null,
    search: null,
    versions: [{ id: resume.id, label: "Family / v3 / cv.pdf" }],
    ...patch,
  } satisfies CompanyApplications;
}

function render(
  value: CompanyApplications,
  props: { openId?: string | null; requested?: string; mailIntent?: string } = {},
) {
  return renderToStaticMarkup(
    createElement(ApplicationsTab, {
      data: value,
      companyKey: "oracle",
      companyName: "Oracle",
      now: NOW,
      ...props,
    }),
  );
}

describe("company page applications", () => {
  const newer = application({
    role: "Staff Engineer",
    city: "Hyderabad",
    rounds: [round("a", { name: "Machine coding", scheduledAt: at("2026-11-20T11:00:00") })],
  });
  const older = application({
    role: "Senior Engineer",
    city: "Pune",
    requisition: null,
    sentAt: at("2026-10-02T10:00:00"),
    phase: "Applied",
    status: "APPLIED",
  } as Partial<ApplicationRecord>);
  const rows = [rowFor(newer, stepDay(newer.id, "Applied for Staff Engineer")), rowFor(older)];

  it("lists each application as a row with date, requisition, role and state", () => {
    const html = render(data(rows));
    expect(html).toContain(`id="application-${newer.id}"`);
    expect(html).toContain(`id="application-${older.id}"`);
    expect(html).toContain("4 Nov 2026");
    expect(html).toContain("2 Oct 2026");
    expect(html).toContain("JB0076231");
    expect(html).toContain("No requisition");
    expect(html).toContain("Staff Engineer · Hyderabad");
    expect(html).toContain("Senior Engineer · Pune");
    expect(html.indexOf("Staff Engineer · Hyderabad")).toBeLessThan(
      html.indexOf("Senior Engineer · Pune"),
    );
  });

  it("opens the newest active application when no link names one", () => {
    const html = render(data(rows));
    expect(html).toContain('aria-expanded="true"');
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toContain("Where it stands");
    expect(html).toContain("Applied for Staff Engineer");
  });

  it("opens the row named by the link with its facts, notes, tracker and timeline", () => {
    const html = render(data(rows), { openId: older.id });
    const body = html.slice(html.indexOf(`id="application-${older.id}"`));
    for (const text of [
      "Opening",
      "Applied on",
      "Résumé used",
      "Where it stands",
      "Notes",
      "Application page",
      "not saved",
      "Edit details",
      "+ Add step",
      "Set a follow-up",
      "Sent a follow-up",
      "Filter timeline",
    ])
      expect(body).toContain(text);
    expect(body).toContain("No requisition");
    expect(body).not.toContain("Applied for Staff Engineer");
  });

  it("shows no Practise questions or View application button and no Your applications aside", () => {
    const html = render(data(rows));
    expect(html).not.toContain("Your applications");
    expect(html).not.toContain('aria-label="Company facts"');
    const header = renderToStaticMarkup(
      createElement(DetailHeader, {
        company: {
          id: "oracle",
          name: "Oracle",
          aliases: [],
          cities: ["Hyderabad"],
          focus: "",
          careersUrl: "https://example.com/careers",
          locationSource: "",
          portalNote: "",
        },
        summary: { stage: "Interviewing" } as CompanySummary,
      }),
    );
    expect(header).not.toContain("Practise questions");
    expect(header).not.toContain("View application");
    expect(header).toContain("Company mail");
  });

  it("names the tabs and keeps the old timeline and progress links working", () => {
    expect(detailTabs).toEqual(["applications", "pay", "interviews", "about"]);
    expect(tabAliases).toMatchObject({ timeline: "applications", progress: "applications" });
  });

  it("opens the add-step panel for an outcome named in the link, with its email", () => {
    const mailId = "00000000-0000-4000-8000-0000000000bb";
    const html = render(data(rows), {
      openId: older.id,
      requested: "scheduled",
      mailIntent: mailId,
    });
    expect(html).toContain('name="outcome" value="scheduled"');
    expect(html).toContain(`name="mailId" value="${mailId}"`);
  });

  it("leaves a round's result to its card, not the add-step chips", () => {
    const html = render(data(rows), { openId: newer.id, requested: "rejected" });
    expect(html).toContain("Rejected");
    for (const label of ["Cleared the round", "Didn&#x27;t clear it", "Rescheduled"])
      expect(html).not.toContain(label);
  });

  it("opens the row holding the email a link names, and nothing else", () => {
    const mailId = "00000000-0000-4000-8000-0000000000cc";
    const withMail = [
      rows[0],
      rowFor(older, mailDay(mailItem(mailId, "Interview invite", older.id))),
    ];
    const html = render(data(withMail), { mailIntent: mailId });
    expect(html.match(/aria-expanded="true"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain("Interview invite");
    expect(html).toContain("<dialog");
  });

  it("shows an unsent record with Record as sent in place of Add step", () => {
    const unsent = application({
      phase: "Preparing",
      status: "PREPARING",
      sentAt: null,
      events: [],
      resume: null,
      resumeVersionId: null,
    } as Partial<ApplicationRecord>);
    const html = render(data([rowFor(unsent)]), { openId: unsent.id });
    expect(html).toContain("Not sent");
    expect(html).toContain("Record as sent");
    expect(html).toContain("Not applying");
    expect(html).not.toContain("+ Add step");
  });

  it("leaves the unplaced mail popup shut when an outcome is requested", () => {
    const mailId = "00000000-0000-4000-8000-0000000000ee";
    const loose = mailItem(mailId, "Loose hello", null);
    const value = data(rows, { unplaced: mailDay(loose) });
    expect(render(value, { mailIntent: mailId })).toContain("<dialog");
    const html = render(value, { openId: older.id, requested: "heard", mailIntent: mailId });
    expect(html).not.toContain("<dialog");
  });

  describe("recorded from an email", () => {
    const mailId = "00000000-0000-4000-8000-00000000abcd";
    function rejectedByMail(newer = false) {
      const id = uid();
      const rejection = event(id, "REJECTION_RECEIVED", at("2026-11-10T09:00:00"), {
        payload: { outcome: "rejected", auto: true, mailMessageId: mailId },
      });
      const later = event(id, "OFFER_DECLINED", at("2026-11-10T12:00:00"), {
        payload: { outcome: "declined" },
      });
      return application({
        id,
        phase: "Closed",
        status: "REJECTED",
        closedReason: "REJECTED",
        events: newer ? [rejection, later] : [rejection],
      } as Partial<ApplicationRecord>);
    }

    it("names the outcome the mail rule recorded while it is still the latest", () => {
      expect(autoOutcomeOf(rejectedByMail())).toEqual({
        mailMessageId: mailId,
        outcome: "rejected",
        at: at("2026-11-10T09:00:00"),
      });
      expect(autoOutcomeOf(rejectedByMail(true))).toBeNull();
      expect(autoOutcomeOf(record())).toBeNull();
    });

    it("offers Undo for it, and only while it is the latest", () => {
      const app = rejectedByMail();
      const html = render(data([rowFor(app)]), { openId: app.id });
      expect(html).toContain("Recorded from an email: Rejected");
      expect(html).toMatch(new RegExp(`name="id" value="${mailId}"[\\s\\S]*?Undo</button>`));
      const newer = rejectedByMail(true);
      expect(render(data([rowFor(newer)]), { openId: newer.id })).not.toContain(
        "Recorded from an email",
      );
    });
  });

  it("offers Reopen for a record closed as Not applying, and only then", () => {
    const closed = application({
      phase: "Closed",
      status: "CLOSED",
      closedReason: "WITHDREW",
      sentAt: null,
      events: [],
    } as Partial<ApplicationRecord>);
    expect(render(data([rowFor(closed)]), { openId: closed.id })).toMatch(
      /<button[^>]*>Reopen<\/button>/,
    );
    expect(render(data([rowFor(newer)]), { openId: newer.id })).not.toMatch(/>Reopen</);
  });

  it("renders round notes as Markdown and keeps a long code line in its scrolling pre", () => {
    expect(renderToStaticMarkup(createElement(MarkdownView, { source: "**bold**" }))).toContain(
      "<strong>bold</strong>",
    );
    const line = `x = ${"a".repeat(400)}`;
    const html = renderToStaticMarkup(
      createElement(MarkdownView, { source: "```python\n" + line + "\n```" }),
    );
    expect(html).toMatch(/<pre>[\s\S]*a{400}[\s\S]*<\/pre>/);
  });

  it("keeps company mail on no application in its own section, hidden when empty", () => {
    const loose = mailItem("00000000-0000-4000-8000-0000000000dd", "Loose hello", null);
    const html = render(data(rows, { unplaced: mailDay(loose) }));
    expect(html).toContain("Oracle, not on an application");
    expect(html).toContain("Loose hello");
    expect(render(data(rows))).not.toContain("not on an application");
  });

  it("explains an empty company", () => {
    const html = render(data([]));
    expect(html).toContain("No applications recorded for Oracle yet");
  });
});

describe("company page for a company with no record", () => {
  const rows = [rowFor(application({ role: "Staff Engineer" }))];
  const html = renderToStaticMarkup(
    createElement(MinimalCompanyPage, {
      name: "Level AI",
      companyKey: "level ai",
      data: data(rows),
      now: NOW,
    }),
  );

  it("builds the page link from the company key, escaped", () => {
    expect(companyPageHref({ companyKey: "level ai" })).toBe("/companies/level%20ai");
    expect(companyPageHref({ companyKey: "société générale" })).toBe(
      `/companies/${encodeURIComponent("société générale")}`,
    );
    expect(companyPageHref({ companyKey: "x", companyHref: "/companies/oracle" })).toBe(
      "/companies/oracle",
    );
    for (const key of ["level ai", "société générale"])
      expect(decodeURIComponent(companyPageHref({ companyKey: key }).split("/")[2])).toBe(key);
  });

  it("explains that the company is not listed, with no add button", () => {
    expect(html).toContain(
      "Not in your Companies list yet. Ask Claude Code or Codex to add it; pay, interview loop and sources appear then.",
    );
    expect(html).not.toMatch(/Add company/i);
    expect(html).toContain("Level AI");
  });

  it("keeps Applications as the one active tab and greys the research tabs", () => {
    expect(html).toContain("Applications · 1");
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    for (const label of ["Compensation", "Interview loop", "About &amp; sources"])
      expect(html).toMatch(new RegExp(`<[^>]*aria-disabled="true"[^>]*>${label}<`));
    expect(html).not.toMatch(/<a [^>]*>(Compensation|Interview loop)/);
  });

  it("shows the application rows", () => {
    expect(html).toContain("Staff Engineer");
  });
});
