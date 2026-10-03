import { describe, expect, it } from "vitest";
import { formatDayTime, istDateTime } from "@/features/applications/dates";
import {
  availableOutcomes,
  canEditPlannedRecord,
  historyTone,
  initialOutcome,
  outcomeDetail,
  phaseOf,
  phaseText,
  planOutcome,
  recordStateFrom,
  type OutcomeDetail,
  type RecordState,
} from "@/features/applications/phase";

const NOW = new Date("2026-10-03T10:30:00+05:30");
const state = (patch: Partial<RecordState> = {}): RecordState => ({
  source: "DIRECT",
  status: "APPLIED",
  sent: true,
  replied: false,
  referred: false,
  rounds: [],
  ...patch,
});
const booked = {
  kind: "DSA" as const,
  outcome: "SCHEDULED" as const,
  scheduledAt: new Date("2026-10-03T16:00:00+05:30"),
};
const detail = (patch: Partial<OutcomeDetail> = {}): OutcomeDetail => ({
  name: "",
  note: "",
  happenedAt: NOW,
  ...patch,
});
const text = (patch: Partial<Parameters<typeof phaseText>[0]>) =>
  phaseText({
    phase: "Applied",
    source: "DIRECT",
    replied: false,
    closedReason: null,
    status: "APPLIED",
    rounds: 0,
    typical: null,
    ...patch,
  });

describe("phase", () => {
  it("maps every stage to a phase", () => {
    expect(phaseOf(state({ status: "PREPARING", sent: false }))).toBe("Preparing");
    expect(phaseOf(state({ status: "ACKNOWLEDGED" }))).toBe("Applied");
    expect(phaseOf(state({ status: "FINAL_INTERVIEW" }))).toBe("Interviewing");
    expect(phaseOf(state({ status: "OFFER" }))).toBe("Decision");
    for (const status of ["REJECTED", "WITHDRAWN", "CLOSED"] as const)
      expect(phaseOf(state({ status }))).toBe("Closed");
  });
  it("derives outreach phase from sending, not the stored stage", () => {
    expect(phaseOf(state({ source: "REFERRAL", status: "PREPARING", sent: false }))).toBe(
      "Preparing",
    );
    expect(phaseOf(state({ source: "REFERRAL", status: "PREPARING", sent: true }))).toBe("Applied");
  });
  it("labels phases with rounds, outreach replies and close reasons", () => {
    expect(
      text({ phase: "Interviewing", status: "TECHNICAL_INTERVIEW", rounds: 2, typical: 4 }),
    ).toBe("Interviewing · round 2 of 4");
    expect(text({ phase: "Interviewing", status: "TECHNICAL_INTERVIEW" })).toBe("Interviewing");
    expect(text({ source: "REFERRAL", status: "PREPARING" })).toBe("Sent");
    expect(text({ source: "REFERRAL", status: "PREPARING", replied: true })).toBe("Replied");
    expect(text({ phase: "Closed", status: "CLOSED", closedReason: "ACCEPTED" })).toBe("Accepted");
    expect(text({ phase: "Closed", status: "WITHDRAWN" })).toBe("Withdrew");
  });
});

describe("available outcomes", () => {
  it("offers the applied set before any round", () =>
    expect(availableOutcomes(state())).toEqual([
      "heard",
      "oa",
      "scheduled",
      "followup",
      "rejected",
      "ghosted",
      "withdrew",
    ]));
  it("only settles or moves a booked round", () =>
    expect(availableOutcomes(state({ status: "TECHNICAL_INTERVIEW", rounds: [booked] }))).toEqual([
      "passed",
      "failed",
      "rescheduled",
      "rejected",
      "withdrew",
    ]));
  it("treats a legacy interview stage without rounds as interviewing with nothing booked", () =>
    expect(availableOutcomes(state({ status: "TECHNICAL_INTERVIEW" }))).toEqual([
      "scheduled",
      "offer",
      "followup",
      "rejected",
      "ghosted",
      "withdrew",
    ]));
  it("asks for a decision on an offer", () =>
    expect(availableOutcomes(state({ status: "OFFER" }))).toEqual(["accepted", "declined"]));
  it("offers nothing while preparing or closed", () => {
    expect(availableOutcomes(state({ status: "PREPARING", sent: false }))).toEqual([]);
    expect(availableOutcomes(state({ status: "REJECTED" }))).toEqual([]);
  });
  it("follows outreach from sent to replied to referred", () => {
    const sent = state({ source: "REFERRAL", status: "PREPARING" });
    expect(availableOutcomes(sent)).toEqual(["replied", "followup", "ghosted"]);
    expect(availableOutcomes({ ...sent, replied: true })).toEqual([
      "referred",
      "declinedReferral",
      "withdrew",
    ]);
    expect(availableOutcomes({ ...sent, replied: true, referred: true })).toEqual(["withdrew"]);
  });
  it("preselects a requested outcome only when it applies", () => {
    expect(initialOutcome(["passed", "failed"], "passed")).toBe("passed");
    expect(initialOutcome(["accepted", "declined"], "scheduled")).toBeNull();
    expect(initialOutcome(["replied", "followup", "ghosted"], "heard")).toBe("replied");
    expect(initialOutcome(["passed"], "not-an-outcome")).toBeNull();
    expect(initialOutcome(["passed"], undefined)).toBeNull();
  });
});

it("reads sending, replies and referrals from events", () => {
  const app = { source: "REFERRAL", status: "PREPARING" as const, appliedAt: null };
  expect(recordStateFrom(app, [], ["OUTREACH_SENT", "ACKNOWLEDGEMENT_RECEIVED"])).toMatchObject({
    sent: true,
    replied: false,
    referred: false,
  });
  expect(recordStateFrom(app, [], ["OUTREACH_SENT", "REFERRAL_SUBMITTED"])).toMatchObject({
    replied: true,
    referred: true,
  });
});

describe("outcome detail", () => {
  it("parses round time in India time and defaults OA deadlines to end of day", () => {
    expect(
      outcomeDetail({ outcome: "scheduled", kind: "LLD", day: "2026-10-06", time: "11:00" }, NOW)
        .detail.at,
    ).toEqual(new Date("2026-10-06T11:00:00+05:30"));
    expect(outcomeDetail({ outcome: "oa", day: "2026-10-07" }, NOW).detail.at).toEqual(
      new Date("2026-10-07T23:59:00+05:30"),
    );
  });
  it("requires the details an outcome needs", () => {
    expect(() => outcomeDetail({ outcome: "oa" }, NOW)).toThrow(/completed by/);
    expect(() => outcomeDetail({ outcome: "scheduled", day: "2026-10-06" }, NOW)).toThrow(
      /kind of round/,
    );
    expect(() => outcomeDetail({ outcome: "rescheduled", day: "2026-02-30" }, NOW)).toThrow(
      /valid date/,
    );
  });
  it("backdates to the chosen day and refuses the future", () => {
    expect(
      outcomeDetail({ outcome: "heard", happenedOn: "2026-10-01" }, NOW).detail.happenedAt,
    ).toEqual(new Date("2026-10-01T12:00:00+05:30"));
    expect(
      outcomeDetail({ outcome: "heard", happenedOn: "2026-10-03" }, NOW).detail.happenedAt,
    ).toEqual(NOW);
    expect(() => outcomeDetail({ outcome: "heard", happenedOn: "2026-10-04" }, NOW)).toThrow(
      /future/,
    );
  });
});

describe("planning an outcome", () => {
  it("books an OA as an assessment round", () => {
    const at = istDateTime("2026-10-07", "23:59")!;
    expect(planOutcome(state(), "oa", detail({ at, name: "HackerRank" }))).toEqual({
      status: "ASSESSMENT",
      closedReason: null,
      round: { action: "insert", kind: "ONLINE_ASSESSMENT", name: "HackerRank", scheduledAt: at },
      eventType: "ASSESSMENT_RECEIVED",
      summary: `OA received, complete by ${formatDayTime(at)}`,
    });
  });
  it("maps people rounds to the manager stage and others to technical", () => {
    const at = istDateTime("2026-10-06", "11:00")!;
    expect(planOutcome(state(), "scheduled", detail({ at, kind: "HIRING_MANAGER" })).status).toBe(
      "MANAGER_INTERVIEW",
    );
    expect(planOutcome(state(), "scheduled", detail({ at, kind: "LLD" })).status).toBe(
      "TECHNICAL_INTERVIEW",
    );
  });
  it("settles the booked round", () => {
    const interviewing = state({ status: "TECHNICAL_INTERVIEW", rounds: [booked] });
    expect(planOutcome(interviewing, "passed", detail())).toMatchObject({
      status: "TECHNICAL_INTERVIEW",
      round: { action: "settle", outcome: "PASSED" },
      summary: "Cleared the DSA round",
    });
    expect(planOutcome(interviewing, "failed", detail())).toMatchObject({
      status: "REJECTED",
      closedReason: "REJECTED",
      round: { action: "settle", outcome: "FAILED" },
    });
  });
  it("records close reasons", () => {
    expect(planOutcome(state(), "ghosted", detail())).toMatchObject({
      status: "CLOSED",
      closedReason: "NO_REPLY",
      eventType: "CLOSED_NO_REPLY",
    });
    expect(planOutcome(state({ status: "OFFER" }), "accepted", detail())).toMatchObject({
      status: "CLOSED",
      closedReason: "ACCEPTED",
    });
    expect(
      planOutcome(
        state({ source: "REFERRAL", status: "PREPARING", replied: true }),
        "declinedReferral",
        detail(),
      ),
    ).toMatchObject({ status: "CLOSED", closedReason: "REJECTED" });
  });
  it("keeps the stage for follow-ups and acknowledges a first reply", () => {
    expect(planOutcome(state(), "followup", detail())).toMatchObject({
      status: "APPLIED",
      eventType: "FOLLOW_UP_SENT",
    });
    expect(planOutcome(state(), "heard", detail())).toMatchObject({
      status: "ACKNOWLEDGED",
      eventType: "REPLY_RECEIVED",
    });
  });
  it("rejects outcomes that do not apply, naming the allowed ones", () =>
    expect(() => planOutcome(state(), "passed", detail())).toThrow(
      /Cleared the round does not apply.*Choose: Heard back/,
    ));
});

it("colours history by meaning", () => {
  expect(historyTone("ROUND_PASSED")).toBe("good");
  expect(historyTone("REJECTION_RECEIVED")).toBe("bad");
  expect(historyTone("MANUAL_NOTE")).toBe("neutral");
});

it.each(["DRAFT", "PREPARING", "READY_FOR_REVIEW"] as const)("keeps %s in Preparing", (status) => {
  expect(phaseOf(state({ status }))).toBe("Preparing");
});
it.each([
  "ASSESSMENT",
  "RECRUITER_SCREEN",
  "TECHNICAL_INTERVIEW",
  "MANAGER_INTERVIEW",
  "FINAL_INTERVIEW",
] as const)("preserves legacy %s with no recorded rounds", (status) => {
  expect(phaseOf(state({ status }))).toBe("Interviewing");
  expect(availableOutcomes(state({ status }))).toContain("offer");
});

it("acknowledges an outreach reply when its stored stage is APPLIED", () => {
  expect(planOutcome(state({ source: "REFERRAL" }), "replied", detail())).toMatchObject({
    status: "ACKNOWLEDGED",
    eventType: "REPLY_RECEIVED",
  });
});

it("requires a time for scheduled and rescheduled rounds", () => {
  expect(() =>
    outcomeDetail({ outcome: "scheduled", kind: "DSA", day: "2026-10-06" }, NOW),
  ).toThrow(/time/);
  expect(() => outcomeDetail({ outcome: "rescheduled", day: "2026-10-06" }, NOW)).toThrow(/time/);
});

it("rejects impossible happened dates and times", () => {
  expect(() => outcomeDetail({ outcome: "heard", happenedOn: "2026-02-30" }, NOW)).toThrow(
    /valid date/,
  );
  expect(() =>
    outcomeDetail({ outcome: "scheduled", kind: "DSA", day: "2026-10-06", time: "24:00" }, NOW),
  ).toThrow(/valid date and time/);
});

it("validates required details when planning directly", () => {
  expect(() => planOutcome(state(), "oa", detail())).toThrow(/date/);
  expect(() => planOutcome(state(), "scheduled", detail({ at: NOW }))).toThrow(/kind of round/);
  expect(() =>
    planOutcome(state(), "scheduled", detail({ kind: "DSA", at: new Date("invalid") })),
  ).toThrow(/date/);
  expect(() =>
    planOutcome(
      state({ status: "TECHNICAL_INTERVIEW", rounds: [booked] }),
      "rescheduled",
      detail(),
    ),
  ).toThrow(/date/);
});

it("recognizes legacy outreach sending without treating automatic acknowledgement as a reply", () => {
  const app = { source: "COLD_EMAIL", status: "PREPARING" as const, appliedAt: null };
  expect(recordStateFrom(app, [], [])).toMatchObject({ sent: false, replied: false });
  expect(recordStateFrom(app, [], ["ACKNOWLEDGEMENT_RECEIVED"])).toMatchObject({
    sent: false,
    replied: false,
  });
  expect(recordStateFrom({ ...app, status: "APPLIED" }, [], [])).toMatchObject({
    sent: true,
    replied: false,
  });
  expect(recordStateFrom({ ...app, status: "ACKNOWLEDGED" }, [], [])).toMatchObject({
    sent: true,
    replied: false,
  });
  expect(recordStateFrom(app, [], ["APPLICATION_SUBMITTED"])).toMatchObject({
    sent: true,
    replied: false,
  });
  expect(recordStateFrom(app, [], ["FOLLOW_UP_RECEIVED"])).toMatchObject({
    sent: true,
    replied: true,
  });
  expect(recordStateFrom({ ...app, status: "TECHNICAL_INTERVIEW" }, [], [])).toMatchObject({
    sent: true,
    replied: true,
  });
});

it("allows settled and cancelled rounds to be followed by a new round", () => {
  for (const outcome of ["PASSED", "FAILED", "CANCELLED"] as const)
    expect(
      availableOutcomes(state({ status: "TECHNICAL_INTERVIEW", rounds: [{ ...booked, outcome }] })),
    ).toContain("scheduled");
});

it("moves the booked round and retains its stage", () => {
  const at = istDateTime("2026-10-05", "15:00")!;
  expect(
    planOutcome(
      state({ status: "TECHNICAL_INTERVIEW", rounds: [booked] }),
      "rescheduled",
      detail({ at }),
    ),
  ).toMatchObject({
    status: "TECHNICAL_INTERVIEW",
    round: { action: "move", scheduledAt: at },
    eventType: "ROUND_RESCHEDULED",
  });
});

it("preserves legacy direct MANUAL records by their recorded stage", () => {
  expect(
    phaseOf(recordStateFrom({ source: "MANUAL", status: "APPLIED", appliedAt: null }, [], [])),
  ).toBe("Applied");
  const interviewing = recordStateFrom(
    { source: "MANUAL", status: "TECHNICAL_INTERVIEW", appliedAt: null },
    [],
    [],
  );
  expect(phaseOf(interviewing)).toBe("Interviewing");
  expect(availableOutcomes(interviewing)).toContain("offer");
});

it("uses linked real inbound mail but ignores automatic acknowledgements", () => {
  const app = { source: "REFERRAL", status: "PREPARING" as const, appliedAt: null };
  const reply = { classification: "RECRUITER_OUTREACH", receivedAt: NOW };
  expect(recordStateFrom({ ...app, linkedMail: [reply] }, [], [])).toMatchObject({
    sent: true,
    replied: true,
  });
  expect(
    recordStateFrom(
      { ...app, linkedMail: [{ ...reply, classification: "APPLICATION_ACKNOWLEDGEMENT" }] },
      [],
      [],
    ),
  ).toMatchObject({
    sent: false,
    replied: false,
  });
});

it("restarts outreach awaiting reply after a follow-up later than inbound evidence", () => {
  const earlier = new Date(NOW.getTime() - 86400000);
  const app = {
    source: "COLD_EMAIL",
    status: "PREPARING" as const,
    appliedAt: null,
    linkedMail: [{ classification: "RECRUITER_OUTREACH", receivedAt: earlier }],
    events: [{ eventType: "FOLLOW_UP_SENT", occurredAt: NOW }],
  };
  const waiting = recordStateFrom(app, [], ["FOLLOW_UP_SENT"]);
  expect(waiting).toMatchObject({ sent: true, replied: false });
  expect(availableOutcomes(waiting)).toEqual(["replied", "followup", "ghosted"]);
  expect(
    recordStateFrom(
      { ...app, linkedMail: [{ ...app.linkedMail[0], receivedAt: NOW }] },
      [],
      ["FOLLOW_UP_SENT"],
    ).replied,
  ).toBe(true);
});

it("orders dated reply and follow-up events rather than relying on input order", () => {
  const earlier = new Date(NOW.getTime() - 86400000);
  const app = {
    source: "REFERRAL",
    status: "ACKNOWLEDGED" as const,
    appliedAt: null,
    events: [
      { eventType: "FOLLOW_UP_SENT", occurredAt: NOW },
      { eventType: "REPLY_RECEIVED", occurredAt: earlier },
    ],
  };
  expect(
    recordStateFrom(
      app,
      [],
      app.events.map((event) => event.eventType),
    ),
  ).toMatchObject({ sent: true, replied: false });
  expect(
    recordStateFrom(
      { ...app, source: "DIRECT" },
      [],
      app.events.map((event) => event.eventType),
    ).replied,
  ).toBe(true);
  expect(
    recordStateFrom(
      {
        ...app,
        events: app.events.map((event) => ({
          ...event,
          occurredAt: event.eventType === "REPLY_RECEIVED" ? NOW : earlier,
        })),
      },
      [],
      app.events.map((event) => event.eventType),
    ).replied,
  ).toBe(true);
});

it("allows withdrawal after referral submission and awaiting-reply actions after a later follow-up", () => {
  const earlier = new Date(NOW.getTime() - 86400000);
  const app = {
    source: "REFERRAL",
    status: "ACKNOWLEDGED" as const,
    appliedAt: null,
    events: [
      { eventType: "REPLY_RECEIVED", occurredAt: earlier },
      { eventType: "REFERRAL_SUBMITTED", occurredAt: earlier },
    ],
  };
  const referred = recordStateFrom(app, [], []);
  expect(availableOutcomes(referred)).toEqual(["withdrew"]);
  expect(planOutcome(referred, "withdrew", detail())).toMatchObject({
    status: "WITHDRAWN",
    closedReason: "WITHDREW",
    eventType: "WITHDRAWN",
  });
  const waiting = recordStateFrom(
    { ...app, events: [...app.events, { eventType: "FOLLOW_UP_SENT", occurredAt: NOW }] },
    [],
    [],
  );
  expect(waiting).toMatchObject({ replied: false, referred: true });
  expect(availableOutcomes(waiting)).toEqual(["replied", "followup", "ghosted"]);
});

it.each([
  ["heard", {}, "ACKNOWLEDGED", null, "REPLY_RECEIVED"],
  ["replied", { source: "REFERRAL" }, "ACKNOWLEDGED", null, "REPLY_RECEIVED"],
  ["oa", {}, "ASSESSMENT", null, "ASSESSMENT_RECEIVED"],
  ["scheduled", {}, "TECHNICAL_INTERVIEW", null, "INTERVIEW_SCHEDULED"],
  ["followup", {}, "APPLIED", null, "FOLLOW_UP_SENT"],
  [
    "passed",
    { status: "TECHNICAL_INTERVIEW", rounds: [booked] },
    "TECHNICAL_INTERVIEW",
    null,
    "ROUND_PASSED",
  ],
  [
    "failed",
    { status: "TECHNICAL_INTERVIEW", rounds: [booked] },
    "REJECTED",
    "REJECTED",
    "ROUND_FAILED",
  ],
  [
    "rescheduled",
    { status: "TECHNICAL_INTERVIEW", rounds: [booked] },
    "TECHNICAL_INTERVIEW",
    null,
    "ROUND_RESCHEDULED",
  ],
  ["offer", { status: "TECHNICAL_INTERVIEW" }, "OFFER", null, "OFFER_RECEIVED"],
  ["rejected", {}, "REJECTED", "REJECTED", "REJECTION_RECEIVED"],
  ["ghosted", {}, "CLOSED", "NO_REPLY", "CLOSED_NO_REPLY"],
  ["withdrew", {}, "WITHDRAWN", "WITHDREW", "WITHDRAWN"],
  ["accepted", { status: "OFFER" }, "CLOSED", "ACCEPTED", "OFFER_ACCEPTED"],
  ["declined", { status: "OFFER" }, "CLOSED", "DECLINED", "OFFER_DECLINED"],
  ["referred", { source: "REFERRAL", replied: true }, "APPLIED", null, "REFERRAL_SUBMITTED"],
  [
    "declinedReferral",
    { source: "REFERRAL", replied: true },
    "CLOSED",
    "REJECTED",
    "REFERRAL_DECLINED",
  ],
] as const)(
  "maps %s to the literal status, close reason and event",
  (outcome, patch, status, closedReason, eventType) => {
    expect(
      planOutcome(
        state({ ...patch, rounds: "rounds" in patch ? [...patch.rounds] : [] }),
        outcome,
        detail({ at: NOW, kind: "DSA" }),
      ),
    ).toMatchObject({ status, closedReason, eventType });
  },
);

it("keeps genuinely unsent plans editable but excludes submitted, advanced and closed records", () => {
  for (const source of ["DIRECT", "REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"]) {
    for (const status of ["DRAFT", "PREPARING", "READY_FOR_REVIEW"] as const) {
      const app = { source, status, appliedAt: null };
      expect(canEditPlannedRecord(recordStateFrom(app, [], []))).toBe(true);
      expect(canEditPlannedRecord(recordStateFrom(app, [], ["APPLICATION_SUBMITTED"]))).toBe(false);
      expect(
        canEditPlannedRecord(
          recordStateFrom(
            { ...app, linkedMail: [{ classification: "RECRUITER_OUTREACH", receivedAt: NOW }] },
            [],
            [],
          ),
        ),
      ).toBe(false);
    }
    for (const status of [
      "APPLIED",
      "ACKNOWLEDGED",
      "TECHNICAL_INTERVIEW",
      "OFFER",
      "REJECTED",
      "WITHDRAWN",
      "CLOSED",
    ] as const)
      expect(
        canEditPlannedRecord(recordStateFrom({ source, status, appliedAt: null }, [], [])),
      ).toBe(false);
  }
  expect(
    canEditPlannedRecord(
      recordStateFrom(
        {
          source: "REFERRAL",
          status: "PREPARING",
          appliedAt: null,
          linkedMail: [{ classification: "APPLICATION_ACKNOWLEDGEMENT", receivedAt: NOW }],
        },
        [],
        ["ACTION_PLANNED"],
      ),
    ),
  ).toBe(true);
});
