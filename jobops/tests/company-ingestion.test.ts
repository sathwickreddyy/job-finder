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
  const pay = {
    factKey: "offer",
    category: "COMPENSATION",
    title: "Offer",
    sourceUrl: "https://leetcode.com/discuss/1",
  };
  const paths = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return (error as { issues: { path: (string | number)[] }[] }).issues.map((issue) =>
        issue.path.join("."),
      );
    }
    return [];
  };
  it("requires role, currency and a numeric annual amount for compensation", () => {
    const fact = validateFact({
      ...pay,
      data: { role: "SDE-2", currency: "INR", fixedAnnual: 4500000, notes: { relocation: true } },
    });
    expect(fact.data).toMatchObject({ fixedAnnual: 4500000, notes: { relocation: true } });
    expect(fact.verificationStatus).toBe("COMMUNITY_REPORTED");
    expect(
      paths(() => validateFact({ ...pay, data: { currency: "INR", fixedAnnual: 1 } })),
    ).toContain("data.role");
    expect(paths(() => validateFact({ ...pay, data: { role: "SDE", fixedAnnual: 1 } }))).toContain(
      "data.currency",
    );
    expect(
      paths(() => validateFact({ ...pay, data: { role: "SDE", currency: "inr", fixedAnnual: 1 } })),
    ).toContain("data.currency");
    expect(paths(() => validateFact({ ...pay, data: { role: "SDE", currency: "INR" } }))).toContain(
      "data.fixedAnnual",
    );
    expect(() =>
      validateFact({ ...pay, data: { role: "SDE", currency: "INR", fixedAnnual: 0 } }),
    ).toThrow();
    expect(() =>
      validateFact({ ...pay, data: { role: "SDE", currency: "INR", fixedAnnual: "45L" } }),
    ).toThrow();
    expect(
      validateFact({ ...pay, data: { role: "SDE", currency: "INR", totalAnnual: 5000000 } }).data
        .totalAnnual,
    ).toBe(5000000);
  });
  it("requires a numeric twin for every original text amount", () => {
    const base = { role: "SDE", currency: "INR", fixedAnnual: 3100000 };
    expect(
      paths(() => validateFact({ ...pay, data: { ...base, joiningBonusOriginal: "3L" } })),
    ).toContain("data.joiningBonus");
    expect(
      paths(() => validateFact({ ...pay, data: { ...base, variableOriginal: "10%" } })),
    ).toContain("data.variableAnnual");
    expect(() =>
      validateFact({ ...pay, data: { ...base, variableOriginal: "10%", variablePercent: 10 } }),
    ).not.toThrow();
    expect(
      paths(() => validateFact({ ...pay, data: { ...base, equityOriginal: "$58K over 4 years" } })),
    ).toContain("data.equity");
  });
  it("keeps stock as a typed grant in its own currency", () => {
    const base = { role: "SDE", currency: "INR", fixedAnnual: 3100000 };
    const equity = { amount: 58000, currency: "USD", vestingYears: 4, type: "RSU" };
    expect(validateFact({ ...pay, data: { ...base, equity } }).data.equity).toEqual(equity);
    expect(() => validateFact({ ...pay, data: { ...base, equity: 58000 } })).toThrow();
    expect(
      paths(() => validateFact({ ...pay, data: { ...base, equity: { amount: 58000 } } })),
    ).toContain("data.equity.currency");
    const units = { units: 160, vestingYears: 4, type: "RSU" };
    expect(validateFact({ ...pay, data: { ...base, equity: units } }).data.equity).toEqual(units);
    expect(() =>
      validateFact({ ...pay, data: { ...base, equity: { vestingYears: 4 } } }),
    ).toThrow();
    expect(() => validateFact({ ...pay, data: { ...base, variablePercent: 120 } })).toThrow();
    expect(() =>
      validateFact({ ...pay, data: { ...base, benefits: ["Relocation ₹1.5L"] } }),
    ).not.toThrow();
  });
  it("requires typed rounds, a round count and an outcome for interviews", () => {
    const interview = {
      factKey: "loop",
      category: "INTERVIEW",
      title: "Loop",
      sourceUrl: "https://leetcode.com/discuss/2",
    };
    const data = {
      role: "SDE-2",
      outcome: "OFFER",
      roundCount: 3,
      rounds: [
        { name: "R1 — DSA", kind: "DSA" },
        { name: "R2 — HLD", kind: "HLD" },
      ],
    };
    expect(validateFact({ ...interview, data }).data.roundCount).toBe(3);
    expect(
      paths(() => validateFact({ ...interview, data: { ...data, outcome: "Offer" } })),
    ).toContain("data.outcome");
    expect(
      paths(() =>
        validateFact({ ...interview, data: { ...data, rounds: [{ name: "R1 — DSA" }] } }),
      ),
    ).toContain("data.rounds.0.kind");
    expect(paths(() => validateFact({ ...interview, data: { ...data, rounds: [] } }))).toContain(
      "data.rounds",
    );
    expect(paths(() => validateFact({ ...interview, data: { ...data, roundCount: 1 } }))).toContain(
      "data.roundCount",
    );
    expect(
      paths(() => validateFact({ ...interview, data: { ...data, role: undefined } })),
    ).toContain("data.role");
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
    const schemas = contract.components.schemas as Record<
      string,
      { properties?: Record<string, unknown>; required?: string[] }
    >;
    expect(schemas.COMPENSATIONData.properties?.fixedAnnual).toMatchObject({
      type: "number",
      exclusiveMinimum: 0,
    });
    expect(schemas.COMPENSATIONData.required).toEqual(expect.arrayContaining(["role", "currency"]));
    expect(schemas.INTERVIEWData.required).toEqual(
      expect.arrayContaining(["role", "outcome", "roundCount", "rounds"]),
    );
    expect(JSON.stringify(contract)).toContain("/api/v1/companies/batch");
  });
  it("redacts unexpected storage errors", async () => {
    const response = companyApiError(new Error("postgres password=private-secret"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-secret");
  });
});
