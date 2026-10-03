import { describe, expect, it } from "vitest";
import {
  companyResolver,
  laneDots,
  laneStatus,
  leadOf,
  normalizeCompany,
  pendingMailFrom,
  recordStatus,
  type LaneSource,
} from "@/features/applications/lanes";
import { NOW, at, event, lanesFor, record, round, uid } from "./lane-fixtures";

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
      "Not sent yet",
    ],
    ["sent today", record({ sentAt: at("2026-10-03T09:00:00") }), "applied", "Applied · today"],
    [
      "sent yesterday",
      record({ sentAt: at("2026-10-02T18:30:00") }),
      "applied",
      "Applied · yesterday",
    ],
    [
      "below threshold",
      record({ sentAt: at("2026-09-29T10:00:00") }),
      "applied",
      "Applied · 4 days",
    ],
    ["quiet direct", record({ sentAt: at("2026-09-20T12:00:00") }), "quiet", "Quiet for 13 days"],
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
    ).toEqual({ tone: "closed", label: "Rejected after DSA" });
    expect(closed({ closedReason: "REJECTED" }).label).toBe("Rejected");
    expect(closed({ status: "CLOSED", closedReason: "NO_REPLY" }).label).toBe("Closed, no reply");
    expect(closed({ status: "WITHDRAWN", closedReason: "WITHDREW" }).label).toBe("Withdrew");
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
      "Applied · yesterday · new email",
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
    expect(laneStatus([older, newer], NOW, true)).toEqual({ tone: "closed", label: "Rejected" });
  });
});

describe("lane dots", () => {
  it("uses short labels, skips mail an event already points at, and adds rounds, follow-ups and pending mail", () => {
    const id = uid();
    const mailId = uid();
    const ackId = uid();
    const pendingId = uid();
    const source = record({
      id,
      phase: "Interviewing",
      status: "ASSESSMENT",
      nextActionAt: at("2026-10-05T09:00:00"),
      nextActionNote: "Check the portal",
      events: [
        event(id, "APPLICATION_SUBMITTED", at("2026-09-24T09:00:00"), {
          summary: "Submission confirmation verified on Ashby: Success",
        }),
        event(id, "ASSESSMENT_RECEIVED", at("2026-09-26T10:00:00"), {
          payload: { mailMessageId: mailId },
        }),
        event(id, "MANUAL_NOTE", at("2026-09-27T10:00:00"), { summary: "Asked about the team" }),
      ],
      linkedMail: [
        {
          id: mailId,
          subject: "HackerRank invite",
          classification: "ASSESSMENT",
          receivedAt: at("2026-09-26T09:59:00"),
        },
        {
          id: ackId,
          subject: "We received it",
          classification: "APPLICATION_ACKNOWLEDGEMENT",
          receivedAt: at("2026-09-24T09:05:00"),
        },
      ],
      rounds: [
        round(id, {
          kind: "ONLINE_ASSESSMENT",
          scheduledAt: at("2026-10-07T23:59:00"),
          name: "HackerRank",
        }),
      ],
    });
    const dots = laneDots(
      [source],
      [
        {
          id: pendingId,
          recordId: id,
          subject: "Round 2 confirmed",
          classification: "INTERVIEW",
          receivedAt: at("2026-10-03T09:12:00"),
          outcome: "scheduled",
        },
      ],
      NOW,
    );
    expect(dots.map((dot) => [dot.tone, dot.label])).toEqual([
      ["sent", "Applied"],
      ["mail", "Automatic “we received it”"],
      ["mail", "Got an OA"],
      ["note", "Note"],
      ["pending", "Interview email · not added yet"],
      ["upcoming", "Check the portal"],
      ["upcoming", "OA closes"],
    ]);
    expect(dots[0].detail).toBe("Submission confirmation verified on Ashby: Success");
    expect(dots[2].mailId).toBe(mailId);
    expect(dots[3].detail).toBe("Asked about the team");
    expect(dots[4]).toMatchObject({ mailId: pendingId, outcome: "scheduled", recordId: id });
    expect(dots.every((dot) => dot.role === null && dot.via === null)).toBe(true);
  });

  it("tags roles when a company has several openings, tags outreach by method, and falls back to the sent date", () => {
    const direct = record({
      jobId: "job-a",
      role: "SDE II, Fabric",
      sentAt: at("2026-10-01T10:00:00"),
    });
    const referral = record({
      jobId: "job-b",
      role: "SDE II, Storage",
      source: "REFERRAL",
      sentAt: at("2026-09-30T10:00:00"),
    });
    expect(
      laneDots([direct, referral], [], NOW).map((dot) => [dot.label, dot.role, dot.via]),
    ).toEqual([
      ["Reached out", "SDE II, Storage", "Referral ask"],
      ["Applied", "SDE II, Fabric", null],
    ]);
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
      when: "6 days late",
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
      when: "Fri, 9 Oct",
      text: "Follow up if it stays quiet",
      action: "Open",
    });
    expect(byCompany.Quizizz.next).toMatchObject({
      due: null,
      when: "Not sent",
      text: "Finish and send it",
    });
    expect(byCompany.Nutanix.next).toBeNull();
    expect(lanes.map((lane) => [lane.company, lane.group])).toEqual([
      ["Oracle", "active"],
      ["Quizizz", "active"],
      ["Nutanix", "closed"],
    ]);
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
    expect(lane.status.label).toBe("Applied · yesterday · +1 role");
    expect(lane.next).toMatchObject({
      due: "overdue",
      text: "SDE II, Storage: No reply from Microsoft",
      action: "I followed up",
    });
    expect(lane.group).toBe("needs");
  });
});
