import { describe, expect, it } from "vitest";
import { applicationHref, laneHref } from "@/features/applications/navigation";

const id = "00000000-0000-4000-8000-000000000001";
const mail = "00000000-0000-4000-8000-0000000000bb";
const roundId = "00000000-0000-4000-8000-0000000000cc";
const servicenow = { id, companyKey: "servicenow", companyHref: null };

describe("laneHref", () => {
  it("is the application's own path with the query values it was given", () => {
    expect(laneHref(id)).toBe(`/applications/${id}`);
    expect(laneHref(id, { outcome: "followup" })).toBe(`/applications/${id}?outcome=followup`);
    expect(laneHref(id, { mail, outcome: "oa" })).toBe(
      `/applications/${id}?mail=${mail}&outcome=oa`,
    );
    expect(laneHref(id, { round: roundId })).toBe(`/applications/${id}?round=${roundId}`);
    expect(laneHref(id, { mail: null, outcome: undefined })).toBe(`/applications/${id}`);
  });
});

describe("applicationHref", () => {
  it("opens the row on the company page", () => {
    expect(applicationHref(servicenow)).toBe(`/companies/servicenow?open=${id}#application-${id}`);
    expect(applicationHref({ ...servicenow, companyHref: "/companies/abc" })).toBe(
      `/companies/abc?open=${id}#application-${id}`,
    );
  });

  it("keeps the email and outcome in the query", () => {
    expect(applicationHref(servicenow, { mail, outcome: "heard" })).toBe(
      `/companies/servicenow?open=${id}&mail=${mail}&outcome=heard#application-${id}`,
    );
  });

  it("points a round link at its card, with the row still open", () => {
    expect(applicationHref(servicenow, { round: roundId })).toBe(
      `/companies/servicenow?open=${id}#round-${roundId}`,
    );
  });
});
