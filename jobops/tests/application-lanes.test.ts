import { describe, expect, it } from "vitest";
import {
  companyResolver,
  laneStatus,
  leadOf,
  normalizeCompany,
  recordStatus,
  type LaneSource,
} from "@/features/applications/lanes";
import { NOW, at, record, round, uid } from "./lane-fixtures";

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
