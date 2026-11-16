import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { namedStepsOf } from "@/features/applications/named-steps";
import type { ApplicationRecord } from "@/features/applications/read";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { at, record, round, uid } from "./lane-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/applications/record-actions", () => ({
  updateRound: vi.fn(),
  updateApplicationDetails: vi.fn(),
  saveApplicationNotes: vi.fn(),
}));
vi.mock("@/features/mail/triage-actions", () => ({ unlinkMail: vi.fn() }));
vi.mock("@/features/mail/read-actions", () => ({ readMailForDialog: vi.fn() }));
const { ApplicationHeader } = await import("@/features/applications/views/page/header");
const { RoundRow } = await import("@/features/applications/views/detail");

const NOW = at("2026-11-16T15:00:00");
function full(patch: Partial<ApplicationRecord> = {}): ApplicationRecord {
  const base = record({
    company: "ServiceNow",
    companyKey: "servicenow",
    role: "Sr Software Engineer",
  });
  return {
    ...base,
    notes: "",
    applicationUrl: null,
    appliedAt: base.sentAt,
    resumeVersionId: null,
    resume: null,
    requisition: null,
    jobUrl: "https://careers.example/job/1",
    postedAtKind: null,
    linkedIds: [],
    latest: null,
    ...patch,
  } as ApplicationRecord;
}
const header = (
  app: ApplicationRecord,
  siblings: { id: string; requisition: string | null; label: string }[] = [],
) =>
  renderToStaticMarkup(
    createElement(ApplicationHeader, { record: app, siblings, steps: namedStepsOf(app, NOW) }),
  );

describe("application page header", () => {
  it("says when no requisition is saved and still links the posting", () => {
    const html = header(full());
    expect(html).toContain("No requisition saved");
    expect(html).toContain('href="https://careers.example/job/1"');
  });

  it("switches between applications at the same company", () => {
    const app = full({ id: uid() });
    const other = uid();
    const html = header(app, [
      { id: app.id, requisition: null, label: "Round 1 · DSA" },
      { id: other, requisition: "JB0076252", label: "Acknowledged" },
    ]);
    const links = html.match(/<a [^>]*href="\/applications\/[^"]+"[^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    expect(links.find((link) => link.includes(app.id))).toContain('aria-current="page"');
    expect(html).toContain("JB0076252");
  });

  it("names the résumé sent and links it in Résumés", () => {
    const html = header(
      full({
        resume: {
          id: "11111111-1111-4111-8111-111111111111",
          filename: "Sathwick_Reddy_Yalla_Resume_servicenow-jb0076231_2026-11-03.pdf",
          label: "ServiceNow tailored",
        },
      }),
    );
    expect(html).toContain("Résumé sent");
    expect(html).toContain("ServiceNow tailored");
    expect(html).toContain('href="/resumes?file=11111111-1111-4111-8111-111111111111"');
  });

  it("shows where the application stands as a named step", () => {
    const id = uid();
    const app = full({
      id,
      phase: "Interviewing",
      status: "TECHNICAL_INTERVIEW",
      rounds: [round(id, { kind: "DSA", scheduledAt: at("2026-11-16T12:00:00") })],
    });
    expect(header(app)).toContain("Round 1 · DSA");
  });
});

describe("round notes and long code", () => {
  it("renders round notes as Markdown", () => {
    const html = renderToStaticMarkup(
      createElement(RoundRow, {
        round: round(uid(), { notes: "**bold**", scheduledAt: at("2026-11-16T12:00:00") }),
        label: "Round 1 · DSA",
        now: NOW,
      }),
    );
    expect(html).toContain("<strong>bold</strong>");
  });

  it("keeps a 400-character code line inside its scrolling pre", () => {
    const line = `x = ${"a".repeat(400)}`;
    const html = renderToStaticMarkup(
      createElement(MarkdownView, { source: "```python\n" + line + "\n```" }),
    );
    expect(html).toMatch(/<pre>[\s\S]*a{400}[\s\S]*<\/pre>/);
  });
});
