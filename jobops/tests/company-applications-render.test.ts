import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
