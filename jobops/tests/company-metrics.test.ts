import { describe, expect, it } from "vitest";
import { money, payExtras, payRange } from "@/features/companies/format";
import {
  companyMetrics,
  companyStage,
  interviewOutcome,
  interviewReports,
  lpa,
  payStats,
} from "@/features/companies/metrics";
import type { ResearchFact } from "@/features/companies/research-data";

let id = 0;
const fact = (category: string, data: Record<string, unknown>) =>
  ({
    id: `fact-${++id}`,
    factKey: `key-${id}`,
    category,
    title: `Report ${id}`,
    summary: "",
    data,
    sourceUrl: `https://leetcode.com/discuss/post/${id}`,
  }) as unknown as ResearchFact;
const pay = (fixedAnnual: number, extra: Record<string, unknown> = {}) =>
  fact("COMPENSATION", { role: "SDE", currency: "INR", fixedAnnual, ...extra });
const loop = (outcome: string, kinds: (string | undefined)[]) =>
  fact("INTERVIEW", {
    role: "SDE",
    outcome,
    roundCount: kinds.length,
    rounds: kinds.map((kind, index) => ({ name: `R${index + 1}`, kind })),
  });

describe("company metrics", () => {
  it("computes interpolated quartiles", () => {
    const stats = payStats([1, 2, 3, 4].map((value) => ({ value, sourceUrl: "x" })))!;
    expect([stats.min, stats.p25, stats.median, stats.p75, stats.max]).toEqual([
      1, 1.75, 2.5, 3.25, 4,
    ]);
    expect(payStats([])).toBeNull();
  });
  it("uses only INR numeric pay and counts the rest as needing review", () => {
    const metrics = companyMetrics([
      pay(3000000),
      pay(4000000),
      fact("COMPENSATION", { role: "SDE", currency: "USD", fixedAnnual: 150000 }),
      fact("COMPENSATION", { role: "SDE", fixedAnnualOriginal: "31 LPA" }),
    ]);
    expect(metrics.fixed?.n).toBe(2);
    expect(metrics.payReports).toBe(4);
    expect(metrics.payNeedsReview).toBe(2);
    expect(payRange(metrics.fixed)).toBe("₹32.5–37.5 LPA");
  });
  it("keeps stock in its own currency with a per-year value", () => {
    const metrics = companyMetrics([
      pay(5200000, {
        equity: { amount: 58000, currency: "USD", vestingYears: 4 },
        joiningBonus: 450000,
      }),
    ]);
    expect(metrics.equity[0]).toMatchObject({ amount: 58000, currency: "USD", perYear: 14500 });
    expect(metrics.total).toBeNull();
    expect(payExtras(metrics)).toEqual(["₹4.5L joining", "$58K stock / 4 yrs"]);
  });
  it("shows the typical grant in the most reported currency, or in units", () => {
    const grants = (...equity: Record<string, unknown>[]) =>
      companyMetrics(equity.map((value) => pay(4000000, { equity: value })));
    const mixed = grants(
      { amount: 1500000, currency: "INR", vestingYears: 4 },
      { amount: 58000, currency: "USD", vestingYears: 4 },
      { amount: 80000, currency: "USD", vestingYears: 4 },
      { amount: 45000, currency: "USD", vestingYears: 4 },
      { units: 160, vestingYears: 4, type: "RSU" },
    );
    expect(payExtras(mixed)).toEqual(["$58K stock / 4 yrs"]);
    expect(payExtras(grants({ units: 160, vestingYears: 4, type: "RSU" }))).toEqual([
      "160 RSUs / 4 yrs",
    ]);
  });
  it("shows a yearly stock value and ignores a reported zero bonus", () => {
    const metrics = companyMetrics([
      pay(4000000, { equity: { annualAmount: 300000, currency: "INR" }, joiningBonus: 0 }),
    ]);
    expect(metrics.joiningBonus).toBeNull();
    expect(payExtras(metrics)).toEqual(["₹3L stock / yr"]);
  });
  it("summarizes interview rounds, outcomes and the typical loop", () => {
    const metrics = companyMetrics([
      loop("OFFER", ["DSA", "HLD", "HIRING_MANAGER"]),
      loop("REJECTED", ["ONLINE_ASSESSMENT", "DSA", "LLD", "HLD", "BEHAVIORAL"]),
      loop("UNKNOWN", ["DSA", "DSA", "HLD"]),
    ]);
    expect(metrics.typicalRounds).toBe(3);
    expect(metrics.roundsRange).toEqual([3, 5]);
    expect(metrics.outcomes).toEqual({ offer: 1, rejected: 1, other: 1 });
    expect(metrics.typicalLoop).toEqual(["DSA", "HLD", "HIRING_MANAGER"]);
    expect(metrics.styleMix).toEqual([
      { family: "Coding", count: 5 },
      { family: "Design", count: 4 },
      { family: "People", count: 2 },
    ]);
  });
  it("treats rounds without a stored kind as Other", () => {
    const metrics = companyMetrics([
      fact("INTERVIEW", {
        role: "SDE",
        outcome: "OFFER",
        roundCount: 1,
        rounds: [{ name: "R1 — DSA" }],
      }),
    ]);
    expect(metrics.typicalLoop).toEqual(["OTHER"]);
  });
  it("reads contract outcomes and legacy outcome text", () => {
    expect(interviewOutcome("OFFER")).toBe("OFFER");
    expect(interviewOutcome("Not selected after HM")).toBe("REJECTED");
    expect(interviewOutcome("Selected")).toBe("OFFER");
    expect(interviewOutcome(undefined)).toBe("UNKNOWN");
  });
  it("orders interview reports newest first with round questions", () => {
    const reports = interviewReports([
      fact("INTERVIEW", {
        publicationYear: 2024,
        role: "A",
        outcome: "OFFER",
        roundCount: 1,
        rounds: [{ name: "R1", kind: "DSA" }],
      }),
      fact("INTERVIEW", {
        publicationYear: 2026,
        role: "B",
        outcome: "PENDING",
        roundCount: 1,
        rounds: [{ name: "R1", kind: "HLD", questions: [{ text: "Design a feed" }] }],
      }),
    ]);
    expect(reports.map((report) => report.role)).toEqual(["B", "A"]);
    expect(reports[0].rounds[0].questions[0].text).toBe("Design a feed");
  });
  it("derives the furthest active pipeline stage", () => {
    expect(companyStage([], 0)).toBe("Not started");
    expect(companyStage([], 2)).toBe("Opening saved");
    expect(companyStage(["APPLIED", "TECHNICAL_INTERVIEW"], 0)).toBe("Interviewing");
    expect(companyStage(["REJECTED", "APPLIED"], 0)).toBe("Applied");
    expect(companyStage(["REJECTED", "WITHDRAWN"], 0)).toBe("Closed");
    expect(companyStage(["OFFER"], 0)).toBe("Offer");
  });
  it("formats lakh, crore and foreign amounts without converting", () => {
    expect(lpa(3100000)).toBe("31");
    expect(money(450000)).toBe("₹4.5L");
    expect(money(12500000)).toBe("₹1.25Cr");
    expect(money(58000, "USD")).toBe("$58K");
    expect(money(1000, "SGD")).toBe("SGD 1K");
  });
});
