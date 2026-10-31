import { describe, expect, it } from "vitest";
import {
  companyResolver,
  laneStatus,
  leadOf,
  normalizeCompany,
  pendingMailFrom,
  recordStatus,
  buildLanes,
  type LaneSource,
  type PendingMail,
} from "@/features/applications/lanes";
import { NOW, at, lanesFor, record, round, uid } from "./lane-fixtures";

describe("company keys", () => {
  it("normalizes case and spacing and maps listed aliases onto the company record", () => {
    const resolve = companyResolver([{ name: "Microsoft", aliases: ["Microsoft India", "MSFT"] }]);
    expect(normalizeCompany("  Level   AI ")).toBe("level ai");
    expect(resolve("microsoft india")).toEqual({
      companyKey: "microsoft",
      companyName: "Microsoft",
    });
    expect(resolve(" MSFT")).toEqual({ companyKey: "microsoft", companyName: "Microsoft" });
    expect(resolve("Level  AI ")).toEqual({ companyKey: "level ai", companyName: "Level AI" });
  });
});

describe("record status", () => {
  it.each<[string, LaneSource, string, string]>([
    [
      "preparing",
      record({ phase: "Preparing", status: "PREPARING", sentAt: null }),
      "preparing",
      "Not sent",
    ],
    ["sent today", record({ sentAt: at("2026-10-03T09:00:00") }), "applied", "Applied"],
    ["sent yesterday", record({ sentAt: at("2026-10-02T18:30:00") }), "applied", "Applied"],
    ["below threshold", record({ sentAt: at("2026-09-29T10:00:00") }), "applied", "Applied"],
    [
      "acknowledged inside the clock",
      record({ status: "ACKNOWLEDGED", sentAt: at("2026-09-29T10:00:00") }),
      "applied",
      "Acknowledged",
    ],
    ["quiet direct", record({ sentAt: at("2026-09-20T12:00:00") }), "quiet", "Quiet 13 days"],
    [
      "online assessment",
      record({
        id: "oa-1",
        phase: "Interviewing",
        status: "ASSESSMENT",
        rounds: [round("oa-1", { kind: "ONLINE_ASSESSMENT" })],
      }),
      "interviewing",
      "Online assessment",
    ],
    [
      "rejected",
      record({ phase: "Closed", status: "REJECTED", closedReason: "REJECTED" }),
      "rejected",
      "Rejected",
    ],
    [
      "outreach below threshold",
      record({ source: "COLD_EMAIL", sentAt: at("2026-09-30T10:00:00") }),
      "applied",
      "Cold email · 3 of 5 days",
    ],
    [
      "quiet outreach",
      record({ source: "REFERRAL", sentAt: at("2026-09-26T21:00:00") }),
      "quiet",
      "Referral ask · 7 days quiet",
    ],
    [
      "offer with a decision date",
      record({ phase: "Decision", status: "OFFER", nextActionAt: at("2026-10-08T09:00:00") }),
      "offer",
      "Offer · decide by 8 Oct",
    ],
    [
      "offer without a date",
      record({ phase: "Decision", status: "OFFER" }),
      "offer",
      "Offer received",
    ],
  ])("%s", (_name, input, tone, label) => {
    expect(recordStatus(input, NOW)).toEqual({ tone, label });
  });

  it("calls a replied outreach record replied instead of counting quiet days", () => {
    const id = uid();
    expect(
      recordStatus(
        record({
          id,
          source: "REFERRAL",
          sentAt: at("2026-09-20T10:00:00"),
          events: [
            {
              id: uid(),
              applicationId: id,
              eventType: "REPLY_RECEIVED",
              source: "MANUAL",
              summary: "Replied",
              payload: {},
              confidence: null,
              occurredAt: at("2026-09-22T10:00:00"),
              createdAt: at("2026-09-22T10:00:00"),
            },
          ],
        }),
        NOW,
      ),
    ).toEqual({ tone: "applied", label: "Referral ask · replied" });
  });

  it("counts recorded rounds and adds the research loop only when it covers them", () => {
    const id = uid();
    const interviewing = (typicalRounds: number | null) =>
      record({
        id,
        phase: "Interviewing",
        status: "TECHNICAL_INTERVIEW",
        typicalRounds,
        rounds: [
          round(id, { kind: "ONLINE_ASSESSMENT", outcome: "PASSED", position: 1 }),
          round(id, { outcome: "SCHEDULED", position: 2, scheduledAt: at("2026-10-03T16:00:00") }),
          round(id, { outcome: "CANCELLED", position: 3 }),
        ],
      });
    expect(recordStatus(interviewing(4), NOW)).toEqual({
      tone: "interviewing",
      label: "Interviewing · round 2 of 4",
    });
    expect(recordStatus(interviewing(1), NOW).label).toBe("Interviewing · round 2");
    expect(
      recordStatus(record({ phase: "Interviewing", status: "TECHNICAL_INTERVIEW" }), NOW).label,
    ).toBe("Interviewing");
  });

  it("names how a closed record ended", () => {
    const id = uid();
    const closed = (patch: Partial<LaneSource>) =>
      recordStatus(record({ phase: "Closed", status: "REJECTED", ...patch }), NOW);
    expect(
      closed({
        id,
        closedReason: "REJECTED",
        rounds: [
          round(id, { kind: "ONLINE_ASSESSMENT", outcome: "PASSED", position: 1 }),
          round(id, { kind: "DSA", outcome: "FAILED", position: 2 }),
        ],
      }),
    ).toEqual({ tone: "rejected", label: "Rejected after DSA" });
    expect(closed({ closedReason: "REJECTED" }).label).toBe("Rejected");
    expect(closed({ status: "CLOSED", closedReason: "NO_REPLY" }).label).toBe("Closed, no reply");
    expect(closed({ status: "WITHDRAWN", closedReason: "WITHDREW" }).label).toBe("Withdrew");
    expect(closed({ status: "CLOSED", closedReason: "WITHDREW", sentAt: null }).label).toBe(
      "Not applying",
    );
    expect(closed({ status: "CLOSED", closedReason: "ACCEPTED" })).toEqual({
      tone: "offer",
      label: "Accepted the offer",
    });
    expect(closed({ status: "CLOSED", closedReason: "DECLINED" }).label).toBe("Declined the offer");
    expect(closed({ status: "WITHDRAWN", closedReason: null }).label).toBe("Withdrew");
  });
});

describe("lead and lane status", () => {
  it("leads with the furthest-along open record and counts other open roles, not outreach for the same role", () => {
    const applied = record({
      jobId: "job-a",
      role: "SDE II, Fabric",
      sentAt: at("2026-10-01T10:00:00"),
    });
    const interviewing = record({
      jobId: "job-b",
      role: "SDE II, Storage",
      phase: "Interviewing",
      status: "TECHNICAL_INTERVIEW",
    });
    const referral = record({
      jobId: "job-b",
      role: "SDE II, Storage",
      source: "REFERRAL",
      sentAt: at("2026-10-01T10:00:00"),
    });
    const rejected = record({
      jobId: "job-c",
      phase: "Closed",
      status: "REJECTED",
      closedReason: "REJECTED",
    });
    const records = [applied, rejected, interviewing, referral];
    expect(leadOf(records).id).toBe(interviewing.id);
    expect(laneStatus(records, NOW)).toEqual({
      tone: "interviewing",
      label: "Interviewing · +1 role",
    });
  });

  it("marks new email only while the lead is Applied, and leads closed lanes with the latest record", () => {
    expect(laneStatus([record({ sentAt: at("2026-10-02T18:30:00") })], NOW, true).label).toBe(
      "Applied · new email",
    );
    const older = record({
      phase: "Closed",
      status: "CLOSED",
      closedReason: "NO_REPLY",
      sentAt: at("2026-09-01T10:00:00"),
    });
    const newer = record({
      phase: "Closed",
      status: "REJECTED",
      closedReason: "REJECTED",
      sentAt: at("2026-09-20T10:00:00"),
    });
    expect(leadOf([older, newer]).id).toBe(newer.id);
    expect(laneStatus([older, newer], NOW, true)).toEqual({ tone: "rejected", label: "Rejected" });
  });
});

describe("pending mail", () => {
  it("keeps matched updates and acknowledgements with their suggested outcome", () => {
    const base = { subject: "s", sender: "a@example.invalid", senderName: "", receivedAt: NOW };
    const pending = pendingMailFrom([
      {
        ...base,
        id: "1",
        classification: "ASSESSMENT",
        bucket: "updates",
        record: { id: "r1", company: "X" },
      },
      {
        ...base,
        id: "2",
        classification: "APPLICATION_ACKNOWLEDGEMENT",
        bucket: "noise",
        record: { id: "r1", company: "X" },
      },
      { ...base, id: "3", classification: "INTERVIEW", bucket: "updates", record: null },
      { ...base, id: "4", classification: "RECRUITER_OUTREACH", bucket: "roles", record: null },
    ]);
    expect(pending.map((mail) => [mail.id, mail.outcome])).toEqual([
      ["1", "oa"],
      ["2", null],
    ]);
  });
});

describe("next steps and groups", () => {
  it("makes an automatic acknowledgement actionable even though noise is absent from the queue", () => {
    const source = record({ sentAt: at("2026-09-20T12:00:00") });
    const mail = {
      id: uid(),
      recordId: source.id,
      subject: "We received your application",
      classification: "APPLICATION_ACKNOWLEDGEMENT",
      receivedAt: NOW,
      outcome: null,
    };
    expect(lanesFor([source], [mail])[0].next).toMatchObject({
      when: "New email",
      action: "Add to timeline",
      href: `/applications?open=${source.id}&mail=${mail.id}`,
    });
  });

  it("keeps a closed company with matched mail visible and actionable until handled", () => {
    const source = record({ phase: "Closed", status: "REJECTED", closedReason: "REJECTED" });
    const mail = {
      id: uid(),
      recordId: source.id,
      subject: "A new update",
      classification: "INTERVIEW",
      receivedAt: NOW,
      outcome: "scheduled" as const,
    };
    const [lane] = lanesFor([source], [mail]);
    expect(lane.group).toBe("needs");
    expect(lane.status.label).toContain("Rejected");
    expect(lane.next?.action).toBe("Link it");
    expect(lanesFor([source])[0].group).toBe("closed");
  });

  it("turns quiet records, booked rounds and matched mail into lane actions, mail first", () => {
    const quiet = record({
      company: "Flipkart",
      companyKey: "flipkart",
      companyName: "Flipkart",
      sentAt: at("2026-09-20T12:00:00"),
    });
    const id = uid();
    const booked = record({
      id,
      company: "Razorpay",
      companyKey: "razorpay",
      companyName: "Razorpay",
      phase: "Interviewing",
      status: "TECHNICAL_INTERVIEW",
      rounds: [round(id, { scheduledAt: at("2026-10-03T16:00:00"), position: 2 })],
    });
    const invited = record({
      company: "Zscaler",
      companyKey: "zscaler",
      companyName: "Zscaler",
      sentAt: at("2026-09-24T09:00:00"),
    });
    const mail = {
      id: uid(),
      recordId: invited.id,
      subject: "Zscaler has invited you to an online assessment",
      classification: "ASSESSMENT",
      receivedAt: at("2026-10-02T18:40:00"),
      outcome: "oa" as const,
    };
    const lanes = lanesFor(
      [quiet, booked, invited],
      [mail],
      [
        {
          id: mail.id,
          title: mail.subject,
          detail: "",
          receivedAt: mail.receivedAt,
          primary: { label: "Link", href: "/" },
        },
      ],
    );
    const next = Object.fromEntries(lanes.map((lane) => [lane.company, lane.next]));
    expect(next.Flipkart).toMatchObject({
      due: "overdue",
      when: "Overdue since 27 Sept",
      action: "I followed up",
      href: `/applications?open=${quiet.id}&outcome=followup`,
    });
    expect(next.Razorpay).toMatchObject({
      due: "today",
      when: "Today, 4:00 pm",
      action: "Open",
      href: `/applications?open=${id}`,
    });
    expect(next.Zscaler).toMatchObject({
      due: "today",
      when: "New email",
      action: "Link it",
      href: `/applications?open=${invited.id}&mail=${mail.id}&outcome=oa`,
    });
    expect(lanes.map((lane) => [lane.company, lane.group])).toEqual([
      ["Flipkart", "needs"],
      ["Zscaler", "needs"],
      ["Razorpay", "needs"],
    ]);
  });

  it("falls back to the quiet-clock date or the send step, and closed lanes have nothing next", () => {
    const fresh = record({ sentAt: at("2026-10-02T18:30:00") });
    const draft = record({
      companyKey: "quizizz",
      companyName: "Quizizz",
      phase: "Preparing",
      status: "PREPARING",
      sentAt: null,
    });
    const closed = record({
      companyKey: "nutanix",
      companyName: "Nutanix",
      phase: "Closed",
      status: "REJECTED",
      closedReason: "REJECTED",
    });
    const lanes = lanesFor([closed, fresh, draft]);
    const byCompany = Object.fromEntries(lanes.map((lane) => [lane.company, lane]));
    expect(byCompany.Oracle.next).toMatchObject({
      due: null,
      when: "By Fri 9 Oct",
      text: "Follow up if it stays quiet",
      action: "Open",
    });
    expect(byCompany.Quizizz.next).toMatchObject({
      due: null,
      when: "Posting date unknown",
      text: "Check the posting date",
    });
    expect(byCompany.Nutanix.next).toBeNull();
    expect(lanes.map((lane) => [lane.company, lane.group])).toEqual([
      ["Quizizz", "needs"],
      ["Oracle", "active"],
      ["Nutanix", "closed"],
    ]);
  });

  it("words due lines as By, a day and time, or Overdue since", () => {
    const source = record();
    const item = (due: "overdue" | "week", dueAt: Date, reason: "followup" | "round") => ({
      key: `${reason}-${due}`,
      recordId: source.id,
      company: "Oracle",
      due,
      dueAt,
      reason,
      title: "Next",
      detail: "",
      primary: { label: "Open", href: "/" },
    });
    const when = (entry: ReturnType<typeof item>) =>
      buildLanes({ records: [source], items: [entry], pending: [], now: NOW })[0].next?.when;
    expect(when(item("week", at("2026-10-06T10:00:00"), "followup"))).toBe("By Tue 6 Oct");
    expect(when(item("week", at("2026-10-06T15:00:00"), "round"))).toBe("Tue 6 Oct, 3:00 pm");
    expect(when(item("overdue", at("2026-09-29T10:00:00"), "followup"))).toBe(
      "Overdue since 29 Sept",
    );
  });

  it("follows the 14-day freshness window for unsent records", () => {
    const now = at("2026-10-31T10:30:00");
    const unsent = (postedAt: Date) =>
      record({ phase: "Preparing", status: "PREPARING", sentAt: null, postedAt });
    const next = (postedAt: Date) =>
      buildLanes({ records: [unsent(postedAt)], items: [], pending: [], now })[0].next;
    expect(next(at("2026-10-21T09:00:00"))).toMatchObject({
      text: "Apply by Wed 4 Nov",
      action: "Record application",
    });
    expect(next(at("2026-10-17T09:00:00"))).toMatchObject({
      text: "Apply by Sat 31 Oct",
      action: "Record application",
    });
    expect(next(at("2026-10-13T09:00:00"))).toMatchObject({
      text: "Posting is 18 days old",
      action: "Not applying",
    });
  });

  it("merges a company's roles into one lane and names the role in its next step", () => {
    const a = record({
      company: "Microsoft",
      companyKey: "microsoft",
      companyName: "Microsoft",
      jobId: "job-a",
      role: "SDE II, Fabric",
      sentAt: at("2026-10-02T10:00:00"),
    });
    const b = record({
      company: "Microsoft",
      companyKey: "microsoft",
      companyName: "Microsoft",
      jobId: "job-b",
      role: "SDE II, Storage",
      source: "REFERRAL",
      sentAt: at("2026-09-26T21:00:00"),
    });
    const lanes = lanesFor([a, b]);
    expect(lanes).toHaveLength(1);
    const [lane] = lanes;
    expect(lane.leadId).toBe(a.id);
    expect(lane.roles.map((role) => role.recordId)).toEqual([a.id, b.id]);
    expect(lane.status.label).toBe("Applied · +1 role");
    expect(lane.next).toMatchObject({
      due: "overdue",
      text: "SDE II, Storage: No reply from Microsoft",
      action: "I followed up",
    });
    expect(lane.group).toBe("needs");
  });
});

describe("lanes per application", () => {
  const byApplication = (records: LaneSource[], pending: PendingMail[] = []) =>
    buildLanes({ records, items: [], pending, now: NOW, by: "application" });

  it("one lane per application when grouped by application", () => {
    const a = record({
      company: "Northstar",
      companyKey: "northstar",
      companyName: "Northstar",
      role: "Backend II",
    });
    const b = record({
      company: "Northstar",
      companyKey: "northstar",
      companyName: "Northstar",
      role: "Platform",
    });
    const lanes = byApplication([a, b]);
    expect(lanes.map((lane) => lane.key).sort()).toEqual([a.id, b.id].sort());
    expect(lanes.every((lane) => lane.company === "Northstar" && lane.roles.length === 1)).toBe(
      true,
    );
    expect(lanesFor([a, b])).toHaveLength(1);
  });

  it("previous jobs are not lanes", () => {
    const previous = record({
      source: "PREVIOUS_JOB",
      phase: "Closed",
      status: "CLOSED",
      closedReason: "ACCEPTED",
    });
    expect(byApplication([previous, record()])).toHaveLength(1);
    expect(lanesFor([previous])).toEqual([]);
  });
});
