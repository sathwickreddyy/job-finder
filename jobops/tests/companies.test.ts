import { describe, expect, it } from "vitest";
import {
  companyActivity,
  companyResumeKey,
  companyResumeSchema,
} from "@/features/companies/domain";
import { companies } from "@/features/companies/catalog";
import { companyMetrics } from "@/features/companies/metrics";
import { shortlistViews, type CompanySummary } from "@/features/companies/summary";
import { CompareTable } from "@/features/companies/views";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("company application references", () => {
  const amazon = companies.find((company) => company.id === "amazon")!;
  const records = [
    {
      id: "blr",
      company: " Amazon India ",
      location: "Bangalore, Karnataka, India",
      appliedAt: new Date(),
    },
    { id: "hyd", company: "AWS", location: "Hyderabad, Telangana", appliedAt: new Date() },
    { id: "draft", company: "amazon", location: "Bengaluru", appliedAt: null },
    { id: "missing", company: "Amazon", location: "", appliedAt: new Date() },
    {
      id: "unrelated",
      company: "Amazon Consulting Partners",
      location: "Bangalore",
      appliedAt: new Date(),
    },
  ];

  it("counts only sent applications for the chosen city while retaining full company history", () => {
    const activity = companyActivity(amazon, "Bengaluru", records, []);
    expect(activity.sent).toBe(1);
    expect(activity.localRecords.map((row) => row.id)).toEqual(["blr", "draft"]);
    expect(activity.records.map((row) => row.id)).toEqual(["blr", "hyd", "draft", "missing"]);
  });

  it("separates Hyderabad applications and saved openings from Bengaluru", () => {
    const activity = companyActivity(amazon, "Hyderabad", records, [
      { company: "Amazon", location: "Hyderabad, India" },
      { company: "Amazon", location: "Bengaluru" },
    ]);
    expect(activity.sent).toBe(1);
    expect(activity.openings).toHaveLength(1);
  });

  it("retains saved openings across unlisted and remote locations for the company page", () => {
    const activity = companyActivity(amazon, "Bengaluru", records, [
      { company: "AWS", location: "Remote" },
      { company: "Amazon India", location: "Chennai" },
      { company: "Amazon Consulting Partners", location: "Bengaluru" },
    ]);
    expect(activity.allOpenings.map((job) => job.location)).toEqual(["Remote", "Chennai"]);
    expect(activity.openings).toHaveLength(0);
  });

  it("keeps applications without a city visible in the unlocated section", () => {
    const activity = companyActivity(amazon, "Location not recorded", records, [
      { company: "AWS", location: "" },
    ]);
    expect(activity.sent).toBe(1);
    expect(activity.localRecords.map((row) => row.id)).toEqual(["missing"]);
    expect(activity.openings).toHaveLength(1);
  });

  it("accepts a role located in both cities without matching similarly named towns", () => {
    const activity = companyActivity(
      amazon,
      "Hyderabad",
      [
        { id: "both", company: "Amazon", location: "Bengaluru / Hyderabad", appliedAt: new Date() },
        { id: "other", company: "Amazon", location: "Hyderabadabad", appliedAt: new Date() },
      ],
      [],
    );
    expect(activity.localRecords.map((row) => row.id)).toEqual(["both"]);
  });

  it("keeps each city’s resume reference separate and accepts DB-backed company identifiers", () => {
    expect(companyResumeKey("amazon", "Bengaluru")).toBe("companyResume:amazon:Bengaluru");
    expect(companyResumeKey("amazon", "Hyderabad")).toBe("companyResume:amazon:Hyderabad");
    expect(
      companyResumeSchema.safeParse({ companyId: "atlassian", city: "Hyderabad", resumeId: "" })
        .success,
    ).toBe(true);
    expect(
      companyResumeSchema.safeParse({ companyId: "unknown", city: "Bengaluru", resumeId: "" })
        .success,
    ).toBe(true);
    expect(
      companyResumeSchema.safeParse({ companyId: "amazon", city: "Hyderabad", resumeId: "invalid" })
        .success,
    ).toBe(false);
    expect(
      companyResumeSchema.safeParse({ companyId: "amazon", city: "Hyderabad", resumeId: "" })
        .success,
    ).toBe(true);
  });

  it("matches imported cities without interpreting their names as regex syntax", () => {
    const activity = companyActivity(
      amazon,
      "Chennai",
      [
        { company: "AWS", location: "Chennai, India", appliedAt: new Date() },
        { company: "AWS", location: "Chennaipattinam", appliedAt: new Date() },
      ],
      [],
    );
    expect(activity.sent).toBe(1);
    expect(
      companyActivity(
        amazon,
        "A+B",
        [{ company: "AWS", location: "A+B, India", appliedAt: new Date() }],
        [],
      ).sent,
    ).toBe(1);
  });
});

const summary = (patch: Partial<CompanySummary>): CompanySummary => ({
  id: "x",
  name: "X",
  focus: "",
  cities: ["Bengaluru"],
  careersUrl: "",
  metrics: companyMetrics([]),
  stage: "Not started",
  applications: 0,
  openings: 0,
  previousEmployer: false,
  ...patch,
});

it("hides previous employers from the shortlist views", () => {
  const paid = companyMetrics([]);
  paid.fixed = { n: 1, min: 18, p25: 18, median: 18, p75: 18, max: 18, points: [] };
  const rows = [
    summary({ id: "oracle", name: "Oracle" }),
    summary({ id: "tcs", name: "TCS", previousEmployer: true }),
    summary({ id: "amazon", name: "Amazon", previousEmployer: true, metrics: paid }),
  ];
  const { shortlist, previous } = shortlistViews(rows);
  expect(shortlist.map((row) => row.id)).toEqual(["oracle", "amazon"]);
  expect(previous.map((row) => row.id)).toEqual(["tcs"]);
});

it("shows the same status pill as Mail", () => {
  const html = renderToStaticMarkup(
    createElement(CompareTable, {
      companies: [
        summary({
          id: "oracle",
          name: "Oracle",
          status: { tone: "quiet", label: "Quiet", detail: "Quiet for 9 days", previous: null },
        }),
      ],
      scaleMax: 50,
      basePath: "/companies",
    }),
  );
  expect(html).toContain("Quiet for 9 days");
  expect(html).toContain(">Quiet<");
});
