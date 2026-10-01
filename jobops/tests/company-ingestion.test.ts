import { describe, expect, it } from "vitest";
import {
  companyInputSchema,
  companyPatchSchema,
  locationIdentity,
  mergeData,
  normalizeCity,
  normalizeIdentity,
  validateFact,
} from "@/features/companies/validation";
import { companyJson, companyApiError, companyContract } from "@/features/companies/http";

describe("company ingestion validation", () => {
  it("normalizes identities and Bangalore location identity", () => {
    expect(normalizeIdentity("  PhonePe   LIMITED ")).toBe("phonepe limited");
    expect(normalizeCity("  BANGALORE ")).toBe("Bengaluru");
    expect(locationIdentity({ city: "Bangalore", state: " Karnataka ", country: "india" })).toBe(
      locationIdentity({ city: "Bengaluru", state: "karnataka", country: "India" }),
    );
  });
  it("accepts ISO timestamps across timezone date boundaries", () => {
    expect(
      companyPatchSchema.safeParse({
        facts: [{ factKey: "report", occurredAt: "2026-03-01T00:30:00+05:30" }],
      }).success,
    ).toBe(true);
    expect(
      companyPatchSchema.safeParse({ facts: [{ factKey: "report", occurredAt: "2026-02-30" }] })
        .success,
    ).toBe(false);
  });
  it("normalizes URL host casing and default ports without accepting credentials", () => {
    const value = companyInputSchema.parse({
      slug: "example",
      name: "Example",
      websiteUrl: " HTTPS://EXAMPLE.COM:443 ",
    });
    expect(value.websiteUrl).toBe("https://example.com/");
    expect(
      companyInputSchema.safeParse({
        slug: "example",
        name: "Example",
        websiteUrl: "https://password:secret@example.com",
      }).success,
    ).toBe(false);
  });
  it("requires canonical identity on POST and forbids changing slugs on PATCH", () => {
    expect(companyInputSchema.safeParse({ name: "Example" }).success).toBe(false);
    expect(companyPatchSchema.safeParse({ slug: "replacement" }).success).toBe(false);
    expect(companyPatchSchema.safeParse({ focus: "Payments" }).success).toBe(true);
    expect(
      companyInputSchema.safeParse({ slug: "example", name: "Example", credentials: "secret" })
        .success,
    ).toBe(false);
    for (const slug of ["schema", "batch", "e6c1d372-8a55-452a-93b4-5832011623ba"])
      expect(companyInputSchema.safeParse({ slug, name: "Real company" }).success).toBe(false);
  });
  it("rejects inverted role experience ranges", () => {
    for (const category of ["ROLE", "HIRING_SIGNAL"])
      expect(() =>
        validateFact({
          factKey: "opening",
          category,
          title: "Opening",
          sourceUrl: "https://example.com/jobs",
          data: { minExperience: 8, maxExperience: 4 },
        }),
      ).toThrow();
  });
  it("validates typed compensation while preserving future sourced information", () => {
    const fact = validateFact({
      factKey: "offer",
      category: "COMPENSATION",
      title: "Offer",
      sourceUrl: "https://leetcode.com/discuss/1",
      data: { fixedAnnual: 4500000, notes: { relocation: true } },
    });
    expect(fact.data).toEqual({ fixedAnnual: 4500000, notes: { relocation: true } });
    expect(fact.verificationStatus).toBe("COMMUNITY_REPORTED");
    expect(() => validateFact({ ...fact, data: { fixedAnnual: -1 } })).toThrow();
    expect(() => validateFact({ ...fact, data: { fixedAnnual: "45L" } })).toThrow();
  });
  it("rejects community verification elevation and unsafe source URLs", () => {
    expect(() =>
      validateFact({
        factKey: "fact",
        category: "OTHER",
        title: "Report",
        sourceUrl: "https://leetcode.com/discuss/1",
        sourceKind: "OFFICIAL",
        verificationStatus: "VERIFIED",
      }),
    ).toThrow();
    expect(() =>
      validateFact({
        factKey: "fact",
        category: "OTHER",
        title: "Report",
        sourceUrl: "javascript:alert(1)",
      }),
    ).toThrow();
  });
  it("rejects excessive nesting and unsafe object keys before recursive merging", () => {
    let nested: Record<string, unknown> = { note: "deep" };
    for (let i = 0; i < 22; i++) nested = { child: nested };
    expect(
      companyPatchSchema.safeParse({ facts: [{ factKey: "deep", data: nested }] }).success,
    ).toBe(false);
    expect(
      companyPatchSchema.safeParse(
        JSON.parse('{"facts":[{"factKey":"unsafe","data":{"__proto__":{"polluted":true}}}]}'),
      ).success,
    ).toBe(false);
  });
  it("allows keyed partial fact updates and recursively merges objects while replacing arrays", () => {
    expect(
      companyPatchSchema.safeParse({
        facts: [{ factKey: "offer", data: { fixedAnnual: 5000000 } }],
      }).success,
    ).toBe(true);
    expect(
      mergeData(
        { offer: { fixed: 1, currency: "INR" }, topics: ["graphs"] },
        { offer: { fixed: 2 }, topics: ["trees"] },
      ),
    ).toEqual({ offer: { fixed: 2, currency: "INR" }, topics: ["trees"] });
  });
});
describe("company HTTP boundary", () => {
  it("enforces JSON, rejects malformed input and oversized streamed bodies", async () => {
    const wrongType = await companyJson(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    ).catch(companyApiError);
    expect((wrongType as Response).status).toBe(415);
    const invalid = await companyJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    ).catch(companyApiError);
    expect((invalid as Response).status).toBe(400);
    const large = await companyJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: " ".repeat(512 * 1024 + 1),
      }),
    ).catch(companyApiError);
    expect((large as Response).status).toBe(413);
  });
  it("exports a self-contained schema and typed category data", () => {
    const contract = companyContract();
    expect(contract.openapi).toBe("3.1.0");
    expect(
      (contract.components.schemas as Record<string, { properties?: Record<string, unknown> }>)
        .COMPENSATIONData.properties?.fixedAnnual,
    ).toMatchObject({ type: "number", minimum: 0 });
    expect(JSON.stringify(contract)).toContain("/api/v1/companies/batch");
  });
  it("redacts unexpected storage errors", async () => {
    const response = companyApiError(new Error("postgres password=private-secret"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-secret");
  });
});
