import { describe, expect, it } from "vitest";
import { buildQueue, silenceClock, type QueueRecord } from "@/features/applications/queue";

const NOW = new Date("2026-10-03T10:30:00+05:30");
const at = (value: string) => new Date(`${value}+05:30`);
let sequence = 0;
const uid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const record = (patch: Partial<QueueRecord> = {}): QueueRecord => ({
  id: uid(),
  company: "Flipkart",
  role: "SDE 2",
  source: "DIRECT",
  status: "APPLIED",
  contact: null,
  sentAt: at("2026-10-01T10:00:00"),
  nextActionAt: null,
  nextActionNote: "",
  rounds: [],
  events: [],
  linkedMail: [],
  ...patch,
});
const queue = (records: QueueRecord[], extra: Partial<Parameters<typeof buildQueue>[0]> = {}) =>
  buildQueue({ records, mail: [], snoozes: new Map(), now: NOW, ...extra });
const round = (patch: Partial<QueueRecord["rounds"][number]>) => ({
  id: uid(),
  kind: "DSA" as const,
  name: "",
  scheduledAt: at("2026-10-05T10:00:00"),
  outcome: "SCHEDULED" as const,
  ...patch,
});

describe("silence clock", () => {
  it("uses the same direct threshold for legacy manual applications", () => {
    expect(
      silenceClock(record({ source: "MANUAL", sentAt: at("2026-09-26T23:59:00") }), NOW),
    ).toMatchObject({ days: 7, threshold: 7 });
  });
  it("uses a real inbound date for legacy interviewing without inventing its missing sent date", () => {
    const legacy = record({
      sentAt: null,
      status: "TECHNICAL_INTERVIEW",
      events: [{ eventType: "REPLY_RECEIVED", occurredAt: at("2026-09-20T12:00:00") }],
    });
    expect(silenceClock(legacy, NOW)).toEqual({
      since: at("2026-09-20T12:00:00"),
      days: 13,
      threshold: 7,
    });
    expect(legacy.sentAt).toBeNull();
  });
  it("uses non-ack linked mail as inbound evidence and outreach resumes only after a later nudge", () => {
    const replied = record({
      source: "COLD_EMAIL",
      status: "PREPARING",
      sentAt: at("2026-09-20T12:00:00"),
      linkedMail: [{ classification: "FOLLOW_UP", receivedAt: at("2026-09-27T09:00:00") }],
    });
    expect(silenceClock(replied, NOW)).toBeNull();
    expect(
      silenceClock(
        {
          ...replied,
          events: [{ eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-09-27T09:00:00") }],
        },
        NOW,
      ),
    ).toBeNull();
    expect(
      silenceClock(
        {
          ...replied,
          events: [{ eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-09-28T09:00:00") }],
        },
        NOW,
      ),
    ).toMatchObject({ days: 5, threshold: 5 });
    expect(silenceClock({ ...replied, source: "DIRECT", status: "APPLIED" }, NOW)?.days).toBe(6);
  });
  it("uses the latest inbound or follow-up regardless of input ordering", () => {
    expect(
      silenceClock(
        record({
          sentAt: at("2026-09-20T12:00:00"),
          events: [
            { eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-10-01T09:00:00") },
            { eventType: "REPLY_RECEIVED", occurredAt: at("2026-09-25T09:00:00") },
          ],
          linkedMail: [{ classification: "INTERVIEW", receivedAt: at("2026-09-28T09:00:00") }],
        }),
        NOW,
      )?.days,
    ).toBe(2);
  });
  it("ignores invalid evidence dates and does not start on invalid or future sending", () => {
    const invalid = new Date("invalid");
    expect(silenceClock(record({ sentAt: invalid }), NOW)).toBeNull();
    expect(silenceClock(record({ sentAt: at("2026-10-04T00:00:00") }), NOW)).toBeNull();
    expect(
      silenceClock(
        record({
          sentAt: at("2026-09-20T12:00:00"),
          events: [{ eventType: "REPLY_RECEIVED", occurredAt: invalid }],
          linkedMail: [{ classification: "FOLLOW_UP", receivedAt: invalid }],
        }),
        NOW,
      )?.days,
    ).toBe(13);
  });
  it("counts IST days since sending and fires at 7 for applications", () =>
    expect(silenceClock(record({ sentAt: at("2026-09-20T12:00:00") }), NOW)).toMatchObject({
      days: 13,
      threshold: 7,
    }));
  it("ignores automatic acknowledgements", () => {
    const quiet = record({
      sentAt: at("2026-09-20T12:00:00"),
      linkedMail: [
        { classification: "APPLICATION_ACKNOWLEDGEMENT", receivedAt: at("2026-09-20T12:05:00") },
      ],
    });
    expect(silenceClock(quiet, NOW)?.days).toBe(13);
  });
  it("restarts from the latest reply for applications", () =>
    expect(
      silenceClock(
        record({
          sentAt: at("2026-09-20T12:00:00"),
          events: [{ eventType: "REPLY_RECEIVED", occurredAt: at("2026-10-01T09:00:00") }],
        }),
        NOW,
      )?.days,
    ).toBe(2));
  it("pauses while a round is booked", () =>
    expect(
      silenceClock(record({ status: "TECHNICAL_INTERVIEW", rounds: [round({})] }), NOW),
    ).toBeNull());
  it("stops outreach at the first reply until the next follow-up", () => {
    const base = {
      source: "REFERRAL",
      status: "PREPARING" as const,
      sentAt: at("2026-09-26T21:00:00"),
    };
    expect(silenceClock(record(base), NOW)).toMatchObject({ days: 7, threshold: 5 });
    const replied = record({
      ...base,
      events: [{ eventType: "REPLY_RECEIVED", occurredAt: at("2026-09-27T09:00:00") }],
    });
    expect(silenceClock(replied, NOW)).toBeNull();
    const nudged = record({
      ...base,
      events: [
        ...replied.events,
        { eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-09-28T09:00:00") },
      ],
    });
    expect(silenceClock(nudged, NOW)).toMatchObject({ days: 5, threshold: 5 });
  });
  it("does not run before sending or after a decision", () => {
    expect(silenceClock(record({ status: "PREPARING", sentAt: null }), NOW)).toBeNull();
    expect(silenceClock(record({ status: "OFFER" }), NOW)).toBeNull();
    expect(silenceClock(record({ status: "REJECTED" }), NOW)).toBeNull();
  });
});

describe("queue", () => {
  it.each(["REJECTED", "WITHDRAWN", "CLOSED"] as const)(
    "suppresses every record item for %s, even unsettled rounds",
    (status) => {
      expect(
        queue([
          record({
            status,
            sentAt: at("2026-09-20T12:00:00"),
            nextActionAt: NOW,
            rounds: [
              round({ scheduledAt: at("2026-09-20T10:00:00") }),
              round({ kind: "ONLINE_ASSESSMENT", scheduledAt: NOW }),
            ],
          }),
        ]),
      ).toEqual([]);
    },
  );
  it("fires silence at IST midnight on the exact threshold and not a day earlier", () => {
    const sent = record({ sentAt: at("2026-09-26T23:59:00") });
    expect(queue([sent], { now: at("2026-10-02T23:59:00") })).toEqual([]);
    expect(queue([sent], { now: at("2026-10-03T00:00:00") })[0]).toMatchObject({
      due: "today",
      reason: "silence",
      dueAt: at("2026-10-03T00:00:00"),
    });
  });
  it("includes the end of day seven and excludes the next IST midnight", () => {
    expect(
      queue([
        record({ nextActionAt: at("2026-10-10T23:59:59") }),
        record({ nextActionAt: at("2026-10-11T00:00:00") }),
      ]),
    ).toHaveLength(1);
  });
  it("keeps old scheduled rounds until settled and ignores settled or undated rounds", () => {
    expect(
      queue([
        record({
          status: "TECHNICAL_INTERVIEW",
          rounds: [
            round({ scheduledAt: at("2026-08-01T10:00:00") }),
            round({ outcome: "PASSED", scheduledAt: at("2026-08-02T10:00:00") }),
            round({ scheduledAt: null }),
          ],
        }),
      ]),
    ).toMatchObject([{ due: "overdue", primary: { label: "Record result" } }]);
  });
  it("changes round action exactly at its booked time", () => {
    expect(queue([record({ rounds: [round({ scheduledAt: NOW })] })])[0].primary.label).toBe(
      "Record result",
    );
  });
  it("treats yesterday mail as today and two-day-old mail as overdue across IST midnight", () => {
    const mail = ["2026-10-02T00:00:00", "2026-10-01T23:59:00"].map((time) => ({
      id: uid(),
      title: time,
      detail: "",
      receivedAt: at(time),
      primary: { label: "Open", href: "/mail" },
    }));
    expect(queue([], { mail, now: at("2026-10-03T00:00:00") }).map((item) => item.due)).toEqual([
      "overdue",
      "today",
    ]);
  });
  it("expires snoozes exactly at the saved instant", () => {
    const quiet = record({ sentAt: at("2026-09-20T12:00:00") });
    expect(
      queue([quiet], { snoozes: new Map([[`silence:${quiet.id}`, new Date(NOW.getTime() + 1)]]) }),
    ).toEqual([]);
    expect(queue([quiet], { snoozes: new Map([[`silence:${quiet.id}`, NOW]]) })).toHaveLength(1);
  });
  it("skips invalid queue timestamps without crashing or hiding valid items", () => {
    const invalid = new Date("invalid");
    expect(
      queue(
        [
          record({ nextActionAt: invalid, rounds: [round({ scheduledAt: invalid })] }),
          record({ nextActionAt: NOW }),
        ],
        {
          mail: [
            {
              id: uid(),
              title: "Bad date",
              detail: "",
              receivedAt: invalid,
              primary: { label: "Open", href: "/mail" },
            },
          ],
        },
      ),
    ).toHaveLength(1);
  });
  it("puts a quiet application in overdue with follow-up actions", () => {
    const quiet = record({ sentAt: at("2026-09-20T12:00:00") });
    const [item] = queue([quiet]);
    expect(item).toMatchObject({
      key: `silence:${quiet.id}`,
      due: "overdue",
      reason: "silence",
      title: "Flipkart has been quiet",
      primary: {
        label: "Record follow-up",
        href: `/applications/${quiet.id}?outcome=followup#what-happened`,
      },
      secondary: {
        label: "Close as no reply",
        href: `/applications/${quiet.id}?outcome=ghosted#what-happened`,
      },
    });
    expect(item.dueAt).toEqual(at("2026-09-27T00:00:00"));
  });
  it("names the contact for quiet outreach", () =>
    expect(
      queue([
        record({
          source: "REFERRAL",
          status: "PREPARING",
          contact: "Rahul Mehta",
          sentAt: at("2026-09-26T21:00:00"),
        }),
      ])[0].title,
    ).toBe("No reply from Rahul Mehta"));
  it("buckets follow-up dates by IST day within a 7-day horizon", () => {
    const items = queue([
      record({ nextActionAt: at("2026-10-01T09:00:00"), nextActionNote: "Finish tailoring" }),
      record({ nextActionAt: at("2026-10-03T09:00:00") }),
      record({ nextActionAt: at("2026-10-10T09:00:00") }),
      record({ nextActionAt: at("2026-10-11T09:00:00") }),
    ]);
    expect(items.map((item) => [item.title, item.due])).toEqual([
      ["Finish tailoring", "overdue"],
      ["Follow up with Flipkart", "today"],
      ["Follow up with Flipkart", "week"],
    ]);
  });
  it("respects IST midnight rather than UTC", () => {
    const items = buildQueue({
      records: [
        record({ nextActionAt: at("2026-10-02T23:59:00") }),
        record({ nextActionAt: at("2026-10-03T00:05:00") }),
      ],
      mail: [],
      snoozes: new Map(),
      now: new Date("2026-10-03T00:10:00+05:30"),
    });
    expect(items.map((item) => item.due)).toEqual(["overdue", "today"]);
  });
  it("shows booked rounds and asks for a result once the time passes", () => {
    const items = queue([
      record({
        company: "Razorpay",
        status: "TECHNICAL_INTERVIEW",
        rounds: [round({ name: "Problem solving", scheduledAt: at("2026-10-02T16:00:00") })],
      }),
      record({
        company: "Zscaler",
        status: "ASSESSMENT",
        rounds: [
          round({
            kind: "ONLINE_ASSESSMENT",
            name: "HackerRank",
            scheduledAt: at("2026-10-07T23:59:00"),
          }),
        ],
      }),
    ]);
    expect(items.map((item) => [item.title, item.due, item.primary.label])).toEqual([
      ["Record the Razorpay DSA result", "overdue", "Record result"],
      ["Zscaler OA closes", "week", "Open record"],
    ]);
    expect(items[1].reason).toBe("deadline");
  });
  it("leads today with mail and orders the rest by time", () => {
    const mail = [
      {
        id: uid(),
        title: "Zscaler invited you to an assessment",
        detail: "HackerRank",
        receivedAt: at("2026-10-02T18:40:00"),
        primary: { label: "Link and update", href: "/x" },
      },
      {
        id: uid(),
        title: "Old mail",
        detail: "",
        receivedAt: at("2026-09-29T10:00:00"),
        primary: { label: "Save as opening", href: "/y" },
      },
    ];
    const items = queue(
      [
        record({
          company: "Uber",
          status: "TECHNICAL_INTERVIEW",
          rounds: [round({ kind: "LLD", scheduledAt: at("2026-10-03T16:00:00") })],
        }),
      ],
      { mail },
    );
    expect(items.map((item) => [item.title, item.due])).toEqual([
      ["Old mail", "overdue"],
      ["Zscaler invited you to an assessment", "today"],
      ["Uber LLD round", "today"],
    ]);
  });
  it("hides snoozed items until the snooze ends and skips closed records", () => {
    const quiet = record({ sentAt: at("2026-09-20T12:00:00") });
    const key = `silence:${quiet.id}`;
    expect(queue([quiet], { snoozes: new Map([[key, at("2026-10-05T00:00:00")]]) })).toEqual([]);
    expect(queue([quiet], { snoozes: new Map([[key, at("2026-10-03T00:00:00")]]) })).toHaveLength(
      1,
    );
    expect(
      queue([record({ status: "REJECTED", nextActionAt: at("2026-10-03T09:00:00") })]),
    ).toEqual([]);
  });
});

it.each(["APPLIED", "TECHNICAL_INTERVIEW"] as const)(
  "starts a legacy %s clock from a recorded follow-up without a historical sent date",
  (status) => {
    const legacy = record({
      status,
      sentAt: null,
      events: [{ eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-09-26T09:00:00") }],
    });
    expect(silenceClock(legacy, NOW)).toEqual({
      since: at("2026-09-26T09:00:00"),
      days: 7,
      threshold: 7,
    });
    expect(queue([legacy])).toMatchObject([
      { reason: "silence", due: "today", dueAt: at("2026-10-03T00:00:00") },
    ]);
    expect(legacy.sentAt).toBeNull();
  },
);

it.each(["event", "mail"])(
  "restarts legacy outreach after a later follow-up using real %s reply evidence",
  (evidence) => {
    const legacy = record({
      source: "REFERRAL",
      status: "PREPARING",
      sentAt: null,
      events:
        evidence === "event"
          ? [{ eventType: "REPLY_RECEIVED", occurredAt: at("2026-09-27T09:00:00") }]
          : [],
      linkedMail:
        evidence === "mail"
          ? [{ classification: "RECRUITER_OUTREACH", receivedAt: at("2026-09-27T09:00:00") }]
          : [],
    });
    expect(silenceClock(legacy, NOW)).toBeNull();
    legacy.events.push({ eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-09-28T09:00:00") });
    expect(silenceClock(legacy, NOW)).toEqual({
      since: at("2026-09-28T09:00:00"),
      days: 5,
      threshold: 5,
    });
    expect(queue([legacy])).toMatchObject([
      { reason: "silence", due: "today", dueAt: at("2026-10-03T00:00:00") },
    ]);
    expect(legacy.sentAt).toBeNull();
  },
);

it("leaves undated legacy records quiet and suppresses clocks for Preparing, Closed or booked rounds", () => {
  expect(silenceClock(record({ sentAt: null, status: "TECHNICAL_INTERVIEW" }), NOW)).toBeNull();
  expect(
    silenceClock(
      record({
        sentAt: null,
        status: "APPLIED",
        events: [{ eventType: "FOLLOW_UP_SENT", occurredAt: new Date("invalid") }],
      }),
      NOW,
    ),
  ).toBeNull();
  const events = [{ eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-09-26T09:00:00") }];
  expect(silenceClock(record({ sentAt: null, status: "PREPARING", events }), NOW)).toBeNull();
  expect(silenceClock(record({ sentAt: null, status: "CLOSED", events }), NOW)).toBeNull();
  expect(
    silenceClock(
      record({ sentAt: null, status: "TECHNICAL_INTERVIEW", events, rounds: [round({})] }),
      NOW,
    ),
  ).toBeNull();
});
