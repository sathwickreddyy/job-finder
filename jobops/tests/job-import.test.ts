import { describe, it, expect } from "vitest";
import { normalizeJobUrl, jobDedupeKey, parseJobImport, resolveDuplicateId } from "@/features/jobs/import";
describe("job import", () => {
  it("removes tracking but preserves job identity", () =>
    expect(normalizeJobUrl("https://EXAMPLE.com/jobs/42/?utm_source=mail&jobId=42#apply")).toBe(
      "https://example.com/jobs/42?jobId=42",
    ));
  it("rejects executable and credential URLs", () => {
    expect(() => normalizeJobUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizeJobUrl("https://user:password@example.com/job")).toThrow();
  });
  it("normalizes fallback company title location", () =>
    expect(
      jobDedupeKey({ company: "  Atlas   Labs", title: "Senior Engineer", location: "Bengaluru " }),
    ).toBe(
      jobDedupeKey({ company: "atlas labs", title: "senior engineer", location: "bengaluru" }),
    ));
  it("reports row and field for invalid data", () => {
    const r = parseJobImport(
      '[{"company":"A","title":"Role","url":"bad","experienceMin":7,"experienceMax":2}]',
      "json",
    );
    expect(r.rows[0].errors.join(" ")).toMatch(/url/);
    expect(r.rows[0].errors.join(" ")).toMatch(/experienceMax/);
    expect(r.valid).toBe(false);
  });
  it("parses quoted CSV descriptions and numeric ranges", () => {
    const r = parseJobImport(
      'company,title,url,experienceMin,description\nAtlas,Engineer,https://example.com/jobs/1,4,"Java, Kafka"',
      "csv",
    );
    expect(r.valid).toBe(true);
    expect(r.rows[0].data?.description).toBe("Java, Kafka");
    expect(r.rows[0].data?.experienceMin).toBe(4);
  });
  it("detects intra-batch duplicate identity", () => {
    const r = parseJobImport(
      JSON.stringify([
        { company: "Atlas", title: "Engineer", url: "https://example.com/1", location: "Pune" },
        { company: "atlas", title: "engineer", url: "https://example.com/2", location: "pune" },
      ]),
      "json",
    );
    expect(r.rows[1].duplicateOf).toBe(1);
  });
  it("rejects invalid dates and impossible salary ranges", () => {
    const r = parseJobImport(
      '[{"company":"A","title":"R","url":"https://example.com","postedAt":"2026-02-30","salaryMin":100,"salaryMax":10}]',
      "json",
    );
    expect(r.valid).toBe(false);
  });
  it("rejects boolean and array numeric values", () => {
    for(const experienceMin of [true,[],{}]) {
      expect(parseJobImport(JSON.stringify([{company:"A",title:"R",url:"https://example.com",experienceMin}]),"json").valid).toBe(false);
    }
  });
  it("tracks omitted fields for safe metadata merges", () => {
    const row=parseJobImport('[{"company":"A","title":"R","url":"https://example.com"}]',"json").rows[0].data!;
    expect(row.providedFields).not.toContain("location");expect(row.providedFields).not.toContain("source");
  });
  it("fails conflicting URL and fallback identities instead of merging distinct jobs", () => {
    expect(()=>resolveDuplicateId([{id:"job-a"},{id:"job-b"}])).toThrow(/identity conflict/);
    expect(resolveDuplicateId([{id:"job-a"},{id:"job-a"}])).toBe("job-a");
  });
});
