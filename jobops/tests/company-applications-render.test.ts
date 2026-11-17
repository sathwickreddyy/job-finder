import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { autoOutcomeOf } from "@/features/applications/journey";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { namedStepsOf } from "@/features/applications/named-steps";
import { availableOutcomes, recordStateFrom, type OutcomeId } from "@/features/applications/phase";
import type { ApplicationRecord } from "@/features/applications/read";
import type { CompanyApplicationRow, CompanyApplications } from "@/features/companies/applications";
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
const { detailTabs, tabAliases } = await import("@/features/companies/detail");
const { StepProgress } = await import("@/features/companies/views/step-progress");
const { CompanyHeader } = await import("@/features/companies/views/company-header");
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
    requisition: "REQ-0001",
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
    newMail: { days: [], handling: {}, more: false },
    lastActivity: null,
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

function headerStatus(label: string): NonNullable<CompanyApplications["status"]> {
  return { tone: "interviewing", label, detail: "", previous: null };
}

function headerHtml(patch: Partial<CompanyApplications> = {}, props: Record<string, unknown> = {}) {
  const closed = rowFor(application({ phase: "Closed", status: "REJECTED" }));
  return renderToStaticMarkup(
    createElement(CompanyHeader, {
      name: "Oracle",
      companyKey: "oracle",
      focus: "Enterprise workflows & AI",
      cities: ["Bengaluru", "Hyderabad"],
      workModes: [],
      careersUrl: "https://example.com/careers",
      stage: "Interviewing",
      data: data([closed, rowFor(application())], {
        status: headerStatus("Interviewing"),
        ...patch,
      }),
      action: { label: "Record application", href: "/applications/new" },
      ...props,
    } as never),
  );
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
    expect(html).toContain("Applied 4 Nov 2026 · REQ-0001 · Hyderabad");
    expect(html).toContain("Applied 2 Oct 2026 · No requisition · Pune");
    expect(html.indexOf("Staff Engineer")).toBeLessThan(html.indexOf("Senior Engineer"));
  });

  describe("closed row cards", () => {
    const step = (state: string, tone = "interviewing") =>
      ({ key: state, label: state, detail: "", state, tone, target: null }) as never;
    const buttonOf = (html: string, id: string) => {
      const from = html.indexOf(`id="application-${id}"`);
      return html.slice(from, html.indexOf("</button>", from));
    };

    it("starts the row button with the role and puts the meta line under it", () => {
      const html = render(data(rows));
      const button = buttonOf(html, older.id);
      const text = button.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      expect(text).toMatch(/Senior Engineer Applied 2 Oct 2026 · No requisition · Pune/);
      expect(button.indexOf("Senior Engineer")).toBeLessThan(button.indexOf("Applied 2 Oct"));
    });

    it("draws one segment per step labelled n of total counting done and current", () => {
      const html = renderToStaticMarkup(
        createElement(StepProgress, {
          steps: [step("done"), step("done"), step("done"), step("current"), step("ahead")],
        }),
      );
      expect(html).toContain('aria-label="4 of 5 steps"');
      expect(html.match(/data-state=/g)).toHaveLength(5);
      expect(html).toContain("bg-primary");
      expect(html).toContain("bg-review");
    });

    it("colours a stopped step as danger", () => {
      const html = renderToStaticMarkup(
        createElement(StepProgress, { steps: [step("done"), step("stopped", "bad")] }),
      );
      expect(html).toContain("bg-destructive");
      expect(html).toContain('aria-label="1 of 2 steps"');
    });

    it("tints the rail by tone and shows the pill with its detail beneath", () => {
      const html = render(data(rows));
      const rail = (id: string) =>
        buttonOf(html, id)
          .match(/<span[^>]*data-rail="(\w+)"[^>]*class="([^"]*)"/)
          ?.slice(1);
      expect(rail(newer.id)?.[0]).toBe("interviewing");
      expect(rail(newer.id)?.[1]).toContain("bg-review");
      expect(rail(older.id)?.[0]).toBe("applied");
      expect(rail(older.id)?.[1]).toContain("bg-primary");
      expect(rail(older.id)?.[1]).toContain("w-1 ");
      expect(buttonOf(html, newer.id)).toContain("Booked 20 Nov");
    });

    it("counts open mail as new and shows nothing for none", () => {
      const open = { ...mailItem("m-new", "Update", newer.id), attention: "open" as const };
      const handled = mailItem("m-old", "Old", older.id);
      const days = [...mailDay(open), ...mailDay({ ...open, id: "m-new2" })];
      const html = render(data([rowFor(newer, days), rowFor(older, mailDay(handled))]));
      expect(buttonOf(html, newer.id)).toContain("2 new");
      expect(buttonOf(html, older.id)).not.toContain(" new");
    });

    it("truncates a long role and keeps it in the title", () => {
      const long = application({ role: "Principal Staff Engineer, Distributed Systems" });
      const html = render(data([rowFor(long)]));
      expect(html).toContain('title="Principal Staff Engineer, Distributed Systems"');
      expect(buttonOf(html, long.id)).toContain("truncate");
    });
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

  it("names the submitted résumé on the open row, or says none is recorded", () => {
    const sent = application({
      resume: {
        id: resume.id,
        filename: "example-resume_2026-11-03.pdf",
        label: "ServiceNow tailored",
      },
    } as Partial<ApplicationRecord>);
    const bare = application({ resume: null, resumeVersionId: null } as Partial<ApplicationRecord>);
    const facts = (value: ApplicationRecord) => {
      const html = render(data([rowFor(value)]), { openId: value.id });
      const body = html.slice(html.indexOf(`id="application-${value.id}"`));
      return body.slice(body.indexOf("Résumé used"), body.indexOf("Where it stands"));
    };
    const withResume = facts(sent);
    expect(withResume).toContain("ServiceNow tailored");
    expect(withResume).toContain("example-resume_2026-11-03.pdf");
    expect(withResume).toContain('title="ServiceNow tailored · example-resume_2026-11-03.pdf"');
    expect(withResume).not.toContain("None recorded");
    expect(facts(bare)).toContain("None recorded");
  });

  it("shows no Practise questions or View application button and no Your applications aside", () => {
    const html = render(data(rows));
    expect(html).not.toContain("Your applications");
    expect(html).not.toContain('aria-label="Company facts"');
    const header = headerHtml();
    expect(header).not.toContain("Practise questions");
    expect(header).not.toContain("View application");
    expect(header).toContain("Company mail");
  });

  describe("company header", () => {
    it("shows exactly one status pill and the focus and cities as one meta line", () => {
      const html = headerHtml();
      expect(html.match(/Interviewing/g)).toHaveLength(1);
      expect(html).toContain("Enterprise workflows &amp; AI · Bengaluru, Hyderabad");
    });

    it("falls back to the stage chip when the company has no status", () => {
      const html = headerHtml({ status: null }, { stage: "Applied" });
      expect(html).toContain("Applied");
    });

    it("counts applications, last activity and the next step", () => {
      const html = headerHtml({
        lastActivity: { at: "2026-11-16T04:00:00.000Z", kind: "Round" },
        next: { text: "DSA result", due: { label: "overdue", tone: "late" } },
      });
      for (const text of ["Status", "Applications", "Last activity", "Next"])
        expect(html).toContain(text);
      expect(html).toContain("2");
      expect(html).toContain("1 active · 1 closed");
      expect(html).toContain("16 Nov");
      expect(html).toContain("Round");
      expect(html).toContain("DSA result");
      expect(html).toContain("overdue");
      expect(html).toContain("text-warning");
    });

    it("tones the next cell by how due it is", () => {
      const toneOf = (tone: "now" | "late" | "calm") =>
        headerHtml({ next: { text: "Reply", due: { label: "soon", tone } } }).match(
          /data-tone="(\w+)"/,
        )?.[1];
      expect(toneOf("late")).toBe("warning");
      expect(toneOf("now")).toBe("link");
      expect(toneOf("calm")).toBeUndefined();
    });

    it("says so when there is nothing yet", () => {
      const html = headerHtml({ status: null, lastActivity: null, next: null });
      for (const text of ["No activity yet", "Nothing due"]) expect(html).toContain(text);
      const empty = headerHtml({ rows: [], status: null });
      expect(empty).toContain("0 active · 0 closed");
    });

    it("keeps careers and the previous job in the menu, not as top-level controls", () => {
      const html = headerHtml();
      expect(html).not.toContain(">Open careers<");
      expect(html).not.toContain("<summary");
      expect(html).toContain('aria-label="More company actions"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain("Company mail");
      expect(html).toContain("Record application");
    });
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

  it("opens the unplaced mail popup when the requested outcome no longer applies", () => {
    const mailId = "00000000-0000-4000-8000-0000000000ef";
    const value = data(rows, {
      unplaced: mailDay(mailItem(mailId, "Loose hello", null)),
      source: { recordId: newer.id, id: mailId, subject: "Loose hello" },
    });
    // The round is booked, so "scheduled" cannot be added.
    const html = render(value, { openId: newer.id, requested: "scheduled", mailIntent: mailId });
    expect(html).toContain("<dialog");
    expect(html).toContain("That outcome no longer applies");
  });

  describe("a mail link on the open row", () => {
    const mailId = "00000000-0000-4000-8000-0000000000dd";
    const sourceFor = (recordId: string) => ({ recordId, id: mailId, subject: "Interview invite" });

    it("says so, offers link-only and opens the email when the outcome no longer applies", () => {
      // A round is booked, so "scheduled" cannot be added again.
      const booked = rowFor(newer, mailDay(mailItem(mailId, "Interview invite", newer.id)));
      const html = render(data([booked], { source: sourceFor(newer.id) }), {
        openId: newer.id,
        requested: "scheduled",
        mailIntent: mailId,
      });
      expect(html).toContain("From this email:");
      expect(html).toContain("Interview invite");
      expect(html).toContain("That outcome no longer applies");
      expect(html).toContain("Link without recording an outcome");
      expect(html).toContain(`name="mailId" value="${mailId}"`);
      expect(html).toContain(`name="recordId" value="${newer.id}"`);
      expect(html).toContain(`value="/companies/oracle?open=${newer.id}"`);
      expect(html).toContain("<dialog");
    });

    it("shows the source beside the add-step panel, with link-only, when the outcome applies", () => {
      const sent = rowFor(older, mailDay(mailItem(mailId, "Interview invite", older.id)));
      const html = render(data([sent], { source: sourceFor(older.id) }), {
        openId: older.id,
        requested: "scheduled",
        mailIntent: mailId,
      });
      expect(html.match(/From this email:/g)).toHaveLength(1);
      expect(html).toContain('name="outcome" value="scheduled"');
      expect(html).toContain("Link without recording an outcome");
      expect(html).not.toContain("no longer applies");
      expect(html).not.toContain("<dialog");
    });
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

  it("shows new mail on no application above the handled mail", () => {
    const fresh = mailItem("00000000-0000-4000-8000-0000000000d1", "Fresh hello", null);
    const done = mailItem("00000000-0000-4000-8000-0000000000d2", "Done hello", null);
    const html = render(
      data(rows, {
        newMail: { days: mailDay(fresh), handling: {}, more: false },
        unplaced: mailDay(done),
      }),
    );
    expect(html).toContain("Oracle, not on an application");
    expect(html.indexOf("Fresh hello")).toBeGreaterThan(-1);
    expect(html.indexOf("Fresh hello")).toBeLessThan(html.indexOf("Done hello"));
    const only = render(
      data(rows, { newMail: { days: mailDay(fresh), handling: {}, more: false } }),
    );
    expect(only).toContain("Fresh hello");
    expect(only).not.toContain("Nothing matches here yet");
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
