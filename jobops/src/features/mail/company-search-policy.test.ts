import { describe, expect, it } from "vitest";
import { companyWindow, companyIdentity, companyRevision, type CompanyProgress } from "./company-search-policy";
import type { MailContext } from "./context";
const query = {
  keywords: [],
  senders: [],
  subjects: [],
  since: "2026-10-27T00:00:00.000Z",
  until: "2026-10-30T00:00:00.000Z",
};
const previous: CompanyProgress = {
  runId: "r",
  revision: "v1",
  since: query.since,
  until: query.until,
  coveredSince: query.since,
  coveredUntil: query.until,
  complete: true,
  limited: false,
  fetched: 25,
  pages: 1,
};
describe("company mail coverage", () => {
  it("uses saved coverage without fetching again for an already covered window", () => {
    expect(companyWindow(previous, query, "v1").cacheHit).toBe(true);
  });
  it("fetches only the uncovered tail with a bounded overlap for delayed messages", () => {
    expect(companyWindow(previous, { ...query, until: "2026-10-31T00:00:00Z" }, "v1").since).toBe(
      "2026-10-29T23:00:00.000Z",
    );
  });
  it("backfills an earlier requested start rather than claiming a coverage gap is complete", () => {
    expect(companyWindow(previous, { ...query, since: "2026-10-01T00:00:00Z" }, "v1").since).toBe(
      "2026-10-01T00:00:00Z",
    );
    expect(companyWindow(previous, { ...query, since: undefined }, "v1").since).toBeUndefined();
  });
  it("resumes saved pages with their original end, but resets when rules or an earlier lower bound change", () => {
    const pending = { ...previous, complete: false, next: "opaque", coveredUntil: undefined };
    expect(companyWindow(pending, { ...query, until: "2026-10-31T00:00:00Z" }, "v1")).toMatchObject(
      { next: "opaque", until: query.until, resumed: true },
    );
    expect(companyWindow(pending, query, "v2").resumed).toBe(false);
    expect(companyWindow(pending, { ...query, since: "2026-10-01T00:00:00Z" }, "v1").resumed).toBe(
      false,
    );
  });
  it("never resumes an exhausted provider-limited window", () => {
    expect(
      companyWindow({ ...previous, complete: false, limited: true }, query, "v1").resumed,
    ).toBe(false);
  });
  it("builds sender and subject identities, never broad body aliases or saved contacts without outreach", () => {
    const company = {
      id: "amazon",
      name: "Amazon",
      rule: {
        company: "Amazon",
        aliases: ["Amazon Jobs"],
        domains: ["amazon.jobs"],
        senders: [],
        subjectTerms: [],
        excludedTerms: [],
      },
      slug: null,
      baselineAt: query.since,
      ruleSource: "fixture",
    };
    const context: MailContext = {
      companies: [company],
      applications: [],
      outbound: [],
      baselineAt: query.since,
    };
    const reordered = { ...company, rule: { excludedTerms: [], subjectTerms: [], senders: [], aliases: ["Amazon Jobs"], domains: ["amazon.jobs"], company: "Amazon" } };
    expect(companyRevision(company, context)).toBe(companyRevision(reordered, context));
    expect(companyIdentity(company, context)).toEqual({
      names: ["Amazon", "Amazon Jobs"],
      domains: ["amazon.jobs"],
      senders: [],
    });
  });
});
