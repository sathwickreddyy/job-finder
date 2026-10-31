import { describe, expect, it } from "vitest";
import { journeyOf } from "@/features/applications/journey";
import { at, event, record, round, uid } from "./lane-fixtures";

const steps = (journey: ReturnType<typeof journeyOf>) =>
  journey.steps.map((step) => [step.label, step.state, step.tone, step.at?.toISOString() ?? null]);

describe("journeyOf", () => {
  it("journey marks Rejected in place of the next step", () => {
    const id = uid();
    const northwind = record({
      id,
      phase: "Closed",
      status: "REJECTED",
      closedReason: "REJECTED",
      sentAt: at("2026-10-02T10:00:00"),
      events: [
        event(id, "APPLICATION_SUBMITTED", at("2026-10-02T10:00:00")),
        event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-10-03T09:00:00")),
        event(id, "REJECTION_RECEIVED", at("2026-10-07T14:00:00")),
      ],
    });
    const journey = journeyOf(northwind);
    expect(journey.kind).toBe("application");
    expect(steps(journey)).toEqual([
      ["Sent", "reached", "applied", at("2026-10-02T10:00:00").toISOString()],
      ["Acknowledged", "reached", "applied", at("2026-10-03T09:00:00").toISOString()],
      ["Rejected", "stopped", "bad", at("2026-10-07T14:00:00").toISOString()],
      ["Offer", "faded", "offer", null],
    ]);
  });

  it("dates Acknowledged from a linked acknowledgement email", () => {
    const journey = journeyOf(
      record({
        status: "ACKNOWLEDGED",
        linkedMail: [
          {
            id: uid(),
            subject: "We received it",
            classification: "APPLICATION_ACKNOWLEDGEMENT",
            receivedAt: at("2026-10-02T20:00:00"),
            attentionState: "DONE",
          },
        ],
      }),
    );
    expect(journey.steps[1]).toMatchObject({
      label: "Acknowledged",
      state: "reached",
      at: at("2026-10-02T20:00:00"),
    });
    expect(journey.steps[2].state).toBe("ahead");
  });

  it("reaches Interviewing from the first round, and earlier steps with it", () => {
    const id = uid();
    const journey = journeyOf(
      record({
        id,
        phase: "Interviewing",
        status: "TECHNICAL_INTERVIEW",
        rounds: [round(id, { scheduledAt: at("2026-10-10T15:00:00") })],
        events: [event(id, "INTERVIEW_SCHEDULED", at("2026-10-06T11:00:00"))],
      }),
    );
    expect(journey.steps.map((step) => step.state)).toEqual([
      "reached",
      "reached",
      "reached",
      "ahead",
    ]);
    expect(journey.steps[1].at).toBeNull();
    expect(journey.steps[2]).toMatchObject({
      tone: "interviewing",
      at: at("2026-10-06T11:00:00"),
    });
  });

  it("journey shows Not sent for an unsent record", () => {
    const journey = journeyOf(record({ phase: "Preparing", status: "PREPARING", sentAt: null }));
    expect(steps(journey)).toEqual([
      ["Not sent", "ahead", "applied", null],
      ["Acknowledged", "ahead", "applied", null],
      ["Interviewing", "ahead", "interviewing", null],
      ["Offer", "ahead", "offer", null],
    ]);
  });

  it("journey shows a muted Closed for Not applying", () => {
    const id = uid();
    const journey = journeyOf(
      record({
        id,
        phase: "Closed",
        status: "CLOSED",
        closedReason: "WITHDREW",
        sentAt: null,
        events: [event(id, "WITHDRAWN", at("2026-10-31T10:00:00"), { summary: "Not applying" })],
      }),
    );
    expect(steps(journey)).toEqual([
      ["Closed", "stopped", "muted", at("2026-10-31T10:00:00").toISOString()],
      ["Acknowledged", "faded", "applied", null],
      ["Interviewing", "faded", "interviewing", null],
      ["Offer", "faded", "offer", null],
    ]);
  });

  it("keeps every step for an accepted offer", () => {
    const id = uid();
    const journey = journeyOf(
      record({
        id,
        phase: "Closed",
        status: "CLOSED",
        closedReason: "ACCEPTED",
        events: [
          event(id, "OFFER_RECEIVED", at("2026-10-20T10:00:00")),
          event(id, "OFFER_ACCEPTED", at("2026-10-22T10:00:00")),
        ],
      }),
    );
    expect(journey.steps.map((step) => step.state)).toEqual([
      "reached",
      "reached",
      "reached",
      "reached",
    ]);
    expect(journey.steps[3]).toMatchObject({ tone: "offer", at: at("2026-10-20T10:00:00") });
  });

  it("outreach journey uses Sent, Replied, Referred", () => {
    const id = uid();
    const journey = journeyOf(
      record({
        id,
        source: "REFERRAL",
        events: [
          event(id, "OUTREACH_SENT", at("2026-10-02T18:30:00")),
          event(id, "REPLY_RECEIVED", at("2026-10-04T09:00:00")),
        ],
      }),
    );
    expect(journey.kind).toBe("outreach");
    expect(steps(journey)).toEqual([
      ["Sent", "reached", "applied", at("2026-10-02T18:30:00").toISOString()],
      ["Replied", "reached", "applied", at("2026-10-04T09:00:00").toISOString()],
      ["Referred", "ahead", "offer", null],
    ]);
  });

  it("shows Not able to refer when a referral is declined", () => {
    const id = uid();
    const journey = journeyOf(
      record({
        id,
        source: "REFERRAL",
        phase: "Closed",
        status: "CLOSED",
        closedReason: "REJECTED",
        events: [
          event(id, "REPLY_RECEIVED", at("2026-10-04T09:00:00")),
          event(id, "REFERRAL_DECLINED", at("2026-10-05T09:00:00")),
        ],
      }),
    );
    expect(journey.steps[2]).toMatchObject({
      label: "Not able to refer",
      state: "stopped",
      tone: "bad",
      at: at("2026-10-05T09:00:00"),
    });
  });
});
