import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { autoOutcomeOf, journeyOf } from "@/features/applications/journey";
import { buildLanes, type LaneSource } from "@/features/applications/lanes";
import type { ApplicationRecord } from "@/features/applications/read";
import { at, event, record, uid } from "./lane-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/applications/record-actions", () => ({
  notApplying: vi.fn(),
  reopenRecord: vi.fn(),
}));
vi.mock("@/features/mail/triage-actions", () => ({ linkMailOnly: vi.fn() }));
vi.mock("@/features/mail/workspace-actions", () => ({
  handleMailAction: vi.fn(),
  reopenMailAction: vi.fn(),
  placeMailAction: vi.fn(),
  retagMail: vi.fn(),
  restoreMailKind: vi.fn(),
  undoAutoOutcomeAction: vi.fn(),
}));
const { ApplicationExpanded } = await import("@/features/applications/views/application-detail");

const NOW = at("2026-11-01T10:30:00");
const mailId = "00000000-0000-4000-8000-00000000abcd";
function render(source: LaneSource) {
  const [lane] = buildLanes({
    records: [source],
    items: [],
    pending: [],
    now: NOW,
    by: "application",
  });
  const full = {
    ...source,
    notes: "",
    applicationUrl: null,
    appliedAt: source.sentAt,
    resumeVersionId: null,
    resume: null,
    jobUrl: "https://example.com/job",
    postedAtKind: null,
    linkedIds: [],
    latest: null,
  } as unknown as ApplicationRecord;
  return renderToStaticMarkup(
    createElement(ApplicationExpanded, {
      record: full,
      lane,
      journey: journeyOf(full),
      story: { days: [], handling: {} },
      now: NOW,
      mail: null,
    }),
  );
}
function rejectedByMail(newer = false) {
  const id = uid();
  const rejection = event(id, "REJECTION_RECEIVED", at("2026-10-31T09:00:00"), {
    payload: { outcome: "rejected", auto: true, mailMessageId: mailId },
  });
  const later = event(id, "OFFER_DECLINED", at("2026-10-31T12:00:00"), {
    payload: { outcome: "declined" },
  });
  return record({
    id,
    phase: "Closed",
    status: "REJECTED",
    closedReason: "REJECTED",
    events: newer ? [rejection, later] : [rejection],
  });
}

describe("autoOutcomeOf", () => {
  it("names the outcome the mail rule recorded while it is still the latest", () => {
    expect(autoOutcomeOf(rejectedByMail())).toEqual({
      mailMessageId: mailId,
      outcome: "rejected",
      at: at("2026-10-31T09:00:00"),
    });
    expect(autoOutcomeOf(rejectedByMail(true))).toBeNull();
    expect(autoOutcomeOf(record())).toBeNull();
  });
});

describe("ApplicationExpanded", () => {
  it("offers Undo beside the journey for an outcome the mail rule recorded", () => {
    const html = render(rejectedByMail());
    expect(html).toContain("Recorded from an email: Rejected");
    expect(html).toMatch(new RegExp(`name="id" value="${mailId}"[\\s\\S]*?Undo</button>`));
  });

  it("offers no Undo once something newer was recorded", () => {
    const html = render(rejectedByMail(true));
    expect(html).not.toContain("Recorded from an email");
  });

  it("offers Reopen for a record closed as Not applying, and only then", () => {
    const closed = render(
      record({
        phase: "Closed",
        status: "CLOSED",
        closedReason: "WITHDREW",
        sentAt: null,
        events: [],
      }),
    );
    expect(closed).toMatch(/<button[^>]*>Reopen<\/button>/);
    expect(render(rejectedByMail())).not.toMatch(/>Reopen</);
  });
});
