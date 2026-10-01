import { describe, expect, it } from "vitest";
import {
  companyActivity,
  companyResumeKey,
  companyResumeSchema,
} from "@/features/companies/domain";
import { companies } from "@/features/companies/catalog";

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

  it("keeps each city’s resume reference separate and validates company presence", () => {
    expect(companyResumeKey("amazon", "Bengaluru")).toBe("companyResume:amazon:Bengaluru");
    expect(companyResumeKey("amazon", "Hyderabad")).toBe("companyResume:amazon:Hyderabad");
    expect(
      companyResumeSchema.safeParse({ companyId: "atlassian", city: "Hyderabad", resumeId: "" })
        .success,
    ).toBe(false);
    expect(
      companyResumeSchema.safeParse({ companyId: "unknown", city: "Bengaluru", resumeId: "" })
        .success,
    ).toBe(false);
    expect(
      companyResumeSchema.safeParse({ companyId: "amazon", city: "Hyderabad", resumeId: "invalid" })
        .success,
    ).toBe(false);
    expect(
      companyResumeSchema.safeParse({ companyId: "amazon", city: "Hyderabad", resumeId: "" })
        .success,
    ).toBe(true);
  });
});
