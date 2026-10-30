import { describe, expect, it } from "vitest";
import type { applicationEvents, applicationRounds } from "@/db/schema";
import type { MailItem } from "@/features/mail/mail-item";
import { timelineEntries, type TimelineDay } from "@/features/timeline/entries";

type EventRow = typeof applicationEvents.$inferSelect;
type RoundRow = typeof applicationRounds.$inferSelect;

const now = new Date("2026-10-31T10:00:00+05:30");
const mail = (id: string, receivedAt: string, extra: Partial<MailItem> = {}): MailItem => ({
  id,
  account: "me@example.com",
  provider: "GMAIL",
  folders: ["INBOX"],
  receivedAt: new Date(receivedAt).toISOString(),
  sender: "priya@northstar.dev",
  senderName: "Priya",
  subject: `Subject ${id}`,
  text: "Hello",
  company: { key: "northstar", name: "Northstar" },
  application: null,
  tag: "process",
  kind: "Interview",
  attention: "open",
  handledAt: null,
  outcome: null,
  ...extra,
});
const event = (
  id: string,
  eventType: string,
  occurredAt: string,
  payload: Record<string, unknown> = {},
): EventRow => ({
  id,
  applicationId: "app-1",
  eventType,
  source: "MANUAL",
  summary: `${eventType} summary`,
  payload,
  confidence: null,
  occurredAt: new Date(occurredAt),
  createdAt: new Date(occurredAt),
});
const round = (id: string, scheduledAt: string, extra: Partial<RoundRow> = {}): RoundRow => ({
  id,
  applicationId: "app-1",
  kind: "DSA",
  name: "",
  scheduledAt: new Date(scheduledAt),
  outcome: "SCHEDULED",
  position: 1,
  notes: "",
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const build = (input: Partial<Parameters<typeof timelineEntries>[0]>) =>
  timelineEntries({
    mail: [],
    events: [],
    rounds: [],
    complete: true,
    filtered: false,
    now,
    ...input,
  });
const flat = (days: TimelineDay[]) => days.flatMap((day) => day.entries);

describe("timelineEntries", () => {
  it("drops mail-driven events and annotates the email", () => {
    const days = build({
      mail: [mail("m1", "2026-10-31T09:00:00+05:30")],
      events: [
        event("e1", "MAIL_LINKED", "2026-10-31T09:05:00+05:30", { mailMessageId: "m1" }),
        event("e2", "ACKNOWLEDGEMENT_RECEIVED", "2026-10-30T09:05:00+05:30"),
        event("e3", "INTERVIEW_SCHEDULED", "2026-10-31T09:10:00+05:30", { mailMessageId: "m1" }),
      ],
    });
    const entries = flat(days);
    expect(entries.filter((entry) => entry.type === "step")).toEqual([]);
    expect(entries).toEqual([
      expect.objectContaining({ type: "mail", recorded: "INTERVIEW_SCHEDULED summary" }),
    ]);
  });

  it("keeps steps from other mail and plain events", () => {
    const days = build({
      mail: [mail("m1", "2026-10-31T09:00:00+05:30")],
      events: [
        event("e1", "APPLICATION_SUBMITTED", "2026-10-31T08:00:00+05:30"),
        event("e2", "ROUND_PASSED", "2026-10-31T08:30:00+05:30", { mailMessageId: "elsewhere" }),
      ],
    });
    const steps = flat(days).filter((entry) => entry.type === "step");
    expect(steps.map((step) => step.text)).toEqual([
      "ROUND_PASSED summary",
      "APPLICATION_SUBMITTED summary",
    ]);
    expect(steps[1]).toMatchObject({ applicationId: "app-1", eventType: "APPLICATION_SUBMITTED" });
  });

  it("orders newest first with Coming up above Today", () => {
    const days = build({
      mail: [
        mail("m1", "2026-10-31T09:00:00+05:30"),
        mail("m2", "2026-10-31T09:30:00+05:30"),
        mail("m3", "2026-10-30T12:00:00+05:30"),
      ],
      rounds: [
        round("r1", "2026-11-01T15:00:00+05:30"),
        round("r2", "2026-10-29T15:00:00+05:30", { outcome: "PASSED" }),
      ],
    });
    expect(days.map((day) => day.label)).toEqual(["Coming up", "Today", "Yesterday"]);
    expect(days[0].entries).toEqual([
      expect.objectContaining({ type: "step", upcoming: true, text: "DSA round" }),
    ]);
    expect(days[1].entries.map((entry) => (entry.type === "mail" ? entry.item.id : ""))).toEqual([
      "m2",
      "m1",
    ]);
  });

  it("labels an upcoming assessment as its closing time", () => {
    const days = build({
      rounds: [round("r1", "2026-11-02T23:59:00+05:30", { kind: "ONLINE_ASSESSMENT" })],
    });
    expect(days[0].entries[0]).toMatchObject({ text: "OA closes", upcoming: true });
  });

  it("groups by India date at 23:30 IST", () => {
    const days = build({
      mail: [mail("m1", "2026-10-30T18:00:00Z"), mail("m2", "2026-10-27T10:00:00+05:30")],
    });
    expect(days.map((day) => [day.key, day.label])).toEqual([
      ["2026-10-30", "Yesterday"],
      ["2026-10-27", "Tue 27 Oct"],
    ]);
  });

  it("hides steps older than the oldest loaded email until complete", () => {
    const input = {
      mail: [mail("m1", "2026-10-30T09:00:00+05:30")],
      events: [event("e1", "APPLICATION_SUBMITTED", "2026-10-20T09:00:00+05:30")],
    };
    expect(flat(build({ ...input, complete: false })).map((entry) => entry.type)).toEqual(["mail"]);
    expect(flat(build({ ...input, complete: true })).map((entry) => entry.type)).toEqual([
      "mail",
      "step",
    ]);
  });

  it("hides steps while filtered", () => {
    const days = build({
      filtered: true,
      mail: [mail("m1", "2026-10-30T09:00:00+05:30")],
      events: [event("e1", "APPLICATION_SUBMITTED", "2026-10-31T09:00:00+05:30")],
      rounds: [round("r1", "2026-11-01T15:00:00+05:30")],
    });
    expect(flat(days).map((entry) => entry.type)).toEqual(["mail"]);
  });
});
