import { beforeEach, expect, it, vi } from "vitest";
import {
  linkedRecordIds,
  readApplications,
  typicalRoundsByName,
} from "@/features/applications/read";
import type { ResearchFact } from "@/features/companies/research-data";

const interview = (roundCount: number) =>
  ({ category: "INTERVIEW", data: { roundCount, rounds: [] } }) as unknown as ResearchFact;

it("finds research round counts by company name or alias", () => {
  const typical = typicalRoundsByName([
    {
      name: "Microsoft",
      aliases: ["Microsoft India Development Center"],
      facts: [interview(4), interview(5), interview(4)],
    },
    { name: "Quince", aliases: [], facts: [] },
  ]);
  expect(typical("microsoft  india development center")).toBe(4);
  expect(typical("Quince")).toBeNull();
  expect(typical("Unknown")).toBeNull();
});
it("links records that share an opening", () => {
  const rows = [
    { id: "a", jobId: "j1" },
    { id: "b", jobId: "j1" },
    { id: "c", jobId: "j2" },
  ];
  const linked = linkedRecordIds(rows);
  expect(linked(rows[0])).toEqual(["b"]);
  expect(linked(rows[2])).toEqual([]);
});

// Replace only the query boundary; the loader, company metrics and phase rules run normally.
const database = vi.hoisted(() => ({ results: [] as unknown[][] }));
vi.mock("@/db", () => ({
  db: {
    select() {
      const result = database.results.shift() ?? [];
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        orderBy: async () => result,
        where: async () => result,
      };
      return query;
    },
  },
}));
beforeEach(() => {
  database.results = [];
});

it("loads linked evidence and legacy phases without inventing sent dates or resume versions", async () => {
  const now = new Date("2026-10-03T10:30:00+05:30");
  const app = {
    id: "outreach",
    jobId: "opening",
    source: "REFERRAL",
    status: "APPLIED",
    appliedAt: null,
    nextActionAt: null,
    nextActionNote: "",
    applicationUrl: null,
    notes: "",
    resumeVersionId: "submitted-resume",
    closedReason: null,
  };
  const job = {
    id: "opening",
    company: " Microsoft  India Development Center ",
    title: "SDE II",
    location: "Hyderabad",
    canonicalUrl: "https://example.com/opening",
  };
  const event = {
    id: "event",
    applicationId: app.id,
    eventType: "REPLY_RECEIVED",
    occurredAt: now,
    summary: "Heard back",
    payload: { recipient: "Ananya" },
  };
  const mail = {
    id: "mail",
    applicationId: app.id,
    subject: "Let's speak",
    classification: "RECRUITER_OUTREACH",
    receivedAt: now,
  };
  database.results = [
    [
      { app, job, version: { id: "submitted-resume", filename: "original.pdf" } },
      {
        app: {
          ...app,
          id: "direct",
          source: "MANUAL",
          status: "TECHNICAL_INTERVIEW",
          resumeVersionId: null,
        },
        job,
        version: null,
      },
    ],
    [],
    [event],
    [mail],
    [{ itemKey: "silence:outreach", until: now }],
    [{ id: "company", name: "Microsoft", aliases: ["Microsoft India Development Center"] }],
    [{ ...interview(4), companyId: "company" }],
  ];
  const { records, snoozes } = await readApplications();
  expect(records[0]).toMatchObject({
    phase: "Applied",
    sentAt: null,
    appliedAt: null,
    contact: "Ananya",
    typicalRounds: 4,
    resume: { id: "submitted-resume", filename: "original.pdf" },
    linkedIds: ["direct"],
    latest: { summary: "Heard back", at: now },
    events: [event],
    linkedMail: [
      { id: "mail", subject: "Let's speak", classification: "RECRUITER_OUTREACH", receivedAt: now },
    ],
  });
  expect(records[1]).toMatchObject({
    phase: "Interviewing",
    sentAt: null,
    resume: null,
    linkedIds: ["outreach"],
  });
  expect(snoozes.get("silence:outreach")).toEqual(now);
});
