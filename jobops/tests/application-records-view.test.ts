import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApplicationRecord } from "@/features/applications/read";
import { RecordsView } from "@/features/applications/views/records";
import { ApplicationsTabs } from "@/features/applications/views/tabs";
import { RoundLadder } from "@/features/applications/views/marks";

const now = new Date("2026-10-03T10:30:00+05:30");
const record = (patch: Partial<ApplicationRecord> = {}): ApplicationRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  jobId: "00000000-0000-4000-8000-000000000010",
  company: "Oracle",
  role: "Software Engineer II",
  city: "Bengaluru",
  jobUrl: "https://example.com/job",
  source: "DIRECT",
  status: "APPLIED",
  contact: null,
  sentAt: new Date("2026-10-01T10:00:00+05:30"),
  appliedAt: new Date("2026-10-01T10:00:00+05:30"),
  nextActionAt: null,
  nextActionNote: "",
  rounds: [],
  events: [],
  linkedMail: [],
  applicationUrl: null,
  notes: "",
  resumeVersionId: "00000000-0000-4000-8000-000000000020",
  resume: { id: "00000000-0000-4000-8000-000000000020", filename: "submitted-v2.pdf" },
  closedReason: null,
  phase: "Applied",
  typicalRounds: null,
  linkedIds: [],
  latest: { summary: "Application submitted", at: now },
  ...patch,
});
const renderRecords = (records: ApplicationRecord[], q = "") =>
  renderToStaticMarkup(createElement(RecordsView, { records, filter: "all", q, now }));

describe("approved Records view", () => {
  it("renders zero tab counts and indicates the current tab", () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationsTabs, {
        active: "records",
        counts: { next: 0, records: 0, emails: null },
      }),
    );
    expect(html.match(/>0<\/span>/g)).toHaveLength(2);
    expect(html).toMatch(
      /<a (?=[^>]*aria-current="page")(?=[^>]*href="\/applications\?tab=records")[^>]*>/,
    );
  });

  it("retains exact submitted resume links and desktop column labels", () => {
    const html = renderRecords([record()]);
    expect(html).toContain(
      'href="/api/resumes/00000000-0000-4000-8000-000000000020/file?download=1"',
    );
    expect(html).toContain("submitted-v2.pdf");
    for (const column of ["Opening", "Rounds", "Latest"]) expect(html).toContain(`>${column}<`);
    expect(html).toContain("No rounds recorded");
    expect(html).toContain("Today");
  });

  it("nests multiple linked outreach records under legacy MANUAL direct applications", () => {
    const direct = record({ source: "MANUAL" });
    const children = ["REFERRAL", "COLD_EMAIL"].map((source, index) =>
      record({
        id: `00000000-0000-4000-8000-00000000000${index + 2}`,
        source,
        contact: index ? "Ravi" : "Ananya",
        linkedIds: [direct.id],
      }),
    );
    const html = renderRecords([children[0], direct, children[1]]);
    expect(html.match(/<li /g)).toHaveLength(1);
    expect(html.match(/border-l-2 border-dashed/g)).toHaveLength(2);
    expect(html.match(/No rounds recorded/g)).toHaveLength(1);
    expect(html).toContain("Referral ask · Ananya");
    expect(html).toContain("Cold email · Ravi");
    expect(html).toContain("Applied directly");
  });

  it("keeps outreach standalone when its parent does not match the search", () => {
    const direct = record();
    const outreach = record({
      id: "00000000-0000-4000-8000-000000000002",
      source: "REFERRAL",
      contact: "Ananya",
      linkedIds: [direct.id],
      status: "PREPARING",
      appliedAt: null,
      sentAt: now,
      events: [
        { eventType: "OUTREACH_SENT", occurredAt: now } as ApplicationRecord["events"][number],
      ],
      latest: null,
      phase: "Preparing", // A stale phase must not override shared state derivation.
    });
    const html = renderRecords([direct, outreach], "Ananya");
    expect(html.match(/<li /g)).toHaveLength(1);
    expect(html).not.toContain("border-l-2 border-dashed");
    expect(html).toContain(">Sent<");
    expect(html).not.toContain("Not sent yet");
    expect(html).toContain("q=Ananya");
  });

  it("labels research slots without inventing recorded rounds", () => {
    const html = renderToStaticMarkup(createElement(RoundLadder, { rounds: [], typical: 16 }));
    expect(html).toContain('aria-label="Typical loop: 16 rounds (company research)"');
    expect(html.match(/border-2 border-dashed/g)).toHaveLength(16);
    expect(html).not.toContain("<button");
  });
});
