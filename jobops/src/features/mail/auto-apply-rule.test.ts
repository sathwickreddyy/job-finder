import { describe, expect, it } from "vitest";
import { decideMailEffect, type RuleApplication, type RuleMail } from "./auto-apply-rule";

const applied = [
  "heard",
  "oa",
  "scheduled",
  "offer",
  "followup",
  "rejected",
  "ghosted",
  "withdrew",
];
const app = (patch: Partial<RuleApplication> = {}): RuleApplication => ({
  id: "a1",
  source: "DIRECT",
  previousJob: false,
  sentAt: new Date("2026-10-02T10:00:00+05:30"),
  phase: "Applied",
  outcomes: applied as RuleApplication["outcomes"],
  bookedRound: false,
  lastHeardAt: null,
  ...patch,
});
const mail = (patch: Partial<RuleMail> = {}): RuleMail => ({
  classification: "APPLICATION_ACKNOWLEDGEMENT",
  receivedAt: new Date("2026-10-03T09:00:00+05:30"),
  companyKey: "weave",
  namedApplicationIds: [],
  blocked: false,
  ...patch,
});

describe("decideMailEffect", () => {
  it("acknowledges for the only live application", () => {
    expect(decideMailEffect(mail(), [app()])).toEqual({ kind: "acknowledge", applicationId: "a1" });
  });

  it("rejects for the only live application", () => {
    expect(decideMailEffect(mail({ classification: "REJECTION" }), [app()])).toEqual({
      kind: "outcome",
      applicationId: "a1",
      outcome: "rejected",
    });
  });

  it("records an offer for the only live application", () => {
    expect(decideMailEffect(mail({ classification: "OFFER" }), [app()])).toEqual({
      kind: "outcome",
      applicationId: "a1",
      outcome: "offer",
    });
  });

  it("asks for an assessment", () => {
    expect(decideMailEffect(mail({ classification: "ASSESSMENT" }), [app()])).toEqual({
      kind: "ask",
      applicationId: "a1",
    });
  });

  it("asks which role when two live applications exist", () => {
    expect(
      decideMailEffect(mail({ classification: "REJECTION" }), [app(), app({ id: "a2" })]),
    ).toEqual({ kind: "ask", applicationId: null });
  });

  it("ignores closed applications when counting live ones", () => {
    const closed = app({ id: "old", phase: "Closed", outcomes: [] });
    expect(
      decideMailEffect(mail({ classification: "REJECTION" }), [closed, app({ id: "new" })]),
    ).toEqual({ kind: "outcome", applicationId: "new", outcome: "rejected" });
  });

  it("ignores outreach and previous jobs", () => {
    const referral = app({ id: "ref", source: "REFERRAL" });
    expect(decideMailEffect(mail(), [referral, app()])).toEqual({
      kind: "acknowledge",
      applicationId: "a1",
    });
    expect(decideMailEffect(mail(), [app({ previousJob: true })])).toEqual({ kind: "none" });
  });

  it("ignores unsent applications", () => {
    const unsent = app({ sentAt: null, phase: "Preparing", outcomes: [] });
    expect(decideMailEffect(mail({ classification: "REJECTION" }), [unsent])).toEqual({
      kind: "none",
    });
  });

  it("leaves mail older than every live application alone", () => {
    const old = mail({ classification: "REJECTION", receivedAt: new Date("2021-06-04T10:00:00Z") });
    expect(decideMailEffect(old, [app({ sentAt: new Date("2026-10-02T10:00:00Z") })])).toEqual({
      kind: "none",
    });
  });

  it("compares India calendar days, not UTC", () => {
    const sent = app({ sentAt: new Date("2026-10-02T04:00:00Z") });
    // 2 Oct 01:30 in India, still 1 Oct in UTC.
    const early = mail({ receivedAt: new Date("2026-10-01T20:00:00Z") });
    expect(decideMailEffect(early, [sent])).toEqual({ kind: "acknowledge", applicationId: "a1" });
  });

  it("asks without re-pointing the suggestion when another application is named", () => {
    expect(
      decideMailEffect(mail({ classification: "REJECTION", namedApplicationIds: ["a2"] }), [app()]),
    ).toEqual({ kind: "ask", applicationId: null });
  });

  it("asks when the company replied after the email", () => {
    const later = app({ lastHeardAt: new Date("2026-10-10T11:00:00+05:30") });
    expect(decideMailEffect(mail({ classification: "REJECTION" }), [later])).toEqual({
      kind: "ask",
      applicationId: "a1",
    });
  });

  it("applies when the last reply came before the email", () => {
    const earlier = app({ lastHeardAt: new Date("2026-10-02T12:00:00+05:30") });
    expect(decideMailEffect(mail({ classification: "REJECTION" }), [earlier])).toEqual({
      kind: "outcome",
      applicationId: "a1",
      outcome: "rejected",
    });
  });

  it("applies when only its own application is named", () => {
    expect(
      decideMailEffect(mail({ classification: "REJECTION", namedApplicationIds: ["a1"] }), [app()]),
    ).toEqual({ kind: "outcome", applicationId: "a1", outcome: "rejected" });
  });

  it("asks when the outcome is not allowed", () => {
    const noOffer = app({ outcomes: applied.filter((id) => id !== "offer") as never });
    expect(decideMailEffect(mail({ classification: "OFFER" }), [noOffer])).toEqual({
      kind: "ask",
      applicationId: "a1",
    });
  });

  it("asks instead of applying while a round is booked", () => {
    const booked = app({ phase: "Interviewing", bookedRound: true });
    expect(decideMailEffect(mail({ classification: "REJECTION" }), [booked])).toEqual({
      kind: "ask",
      applicationId: "a1",
    });
  });

  it("does nothing when blocked", () => {
    expect(decideMailEffect(mail({ classification: "REJECTION", blocked: true }), [app()])).toEqual(
      { kind: "none" },
    );
  });

  it("does nothing without a company", () => {
    expect(decideMailEffect(mail({ companyKey: null }), [app()])).toEqual({ kind: "none" });
  });

  it("rejects after an interview too", () => {
    expect(decideMailEffect(mail({ classification: "INTERVIEW_REJECTION" }), [app()])).toEqual({
      kind: "outcome",
      applicationId: "a1",
      outcome: "rejected",
    });
  });

  it("does nothing for recruiter and other mail", () => {
    expect(decideMailEffect(mail({ classification: "RECRUITER_OUTREACH" }), [app()])).toEqual({
      kind: "none",
    });
    expect(decideMailEffect(mail({ classification: "FOLLOW_UP" }), [app()])).toEqual({
      kind: "none",
    });
  });
});
