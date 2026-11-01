import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompactUsageList } from "@/features/resumes/file-ui";
import {
  orderedUses,
  shortList,
  usedCompanies,
  type GalleryFile,
  type ResumeUse,
} from "@/features/resumes/view-types";

const use = (company: string, submitted = true, role = "Senior Backend Engineer"): ResumeUse => ({
  id: `${company}-${role}`,
  company,
  role,
  method: "Direct application",
  outcome: submitted ? "Applied" : "Preparing",
  date: submitted ? "2026-10-03" : null,
  submitted,
});

const file = (uses: ResumeUse[]) => ({ uses }) as GalleryFile;

describe("resume usage summaries", () => {
  it("keeps a company list short however many companies there are", () => {
    expect(shortList(["Level AI"])).toBe("Level AI");
    expect(shortList(["Level AI", "APEXX"])).toBe("Level AI, APEXX");
    expect(shortList(["Level AI", "APEXX", "Ema AI", "Atlassian"])).toBe("Level AI, APEXX +2");
    expect(shortList(["Level AI", "APEXX", "Ema AI"], 1)).toBe("Level AI +2");
  });

  it("lists each company once and puts sent applications before drafts", () => {
    const records = [
      use("Ema AI", false),
      use("Level AI"),
      use("Level AI", true, "Staff"),
      use("Okta"),
    ];
    expect(usedCompanies(file(records))).toEqual(["Ema AI", "Level AI", "Okta"]);
    expect(orderedUses(file(records)).map((record) => record.company)).toEqual([
      "Level AI",
      "Level AI",
      "Okta",
      "Ema AI",
    ]);
  });
});

describe("CompactUsageList", () => {
  const companies = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((name) => use(name));

  it("shows four records and collapses the rest behind Show all", () => {
    const html = renderToStaticMarkup(createElement(CompactUsageList, { uses: companies }));
    expect(html.match(/<li>/g)).toHaveLength(4);
    expect(html).toContain("Show all 10");
    expect(html).toContain('aria-expanded="false"');
  });

  it("has no toggle when everything already fits", () => {
    const html = renderToStaticMarkup(
      createElement(CompactUsageList, { uses: companies.slice(0, 3) }),
    );
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).not.toContain("Show all");
  });
});
