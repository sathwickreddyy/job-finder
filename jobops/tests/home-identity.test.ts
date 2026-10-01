import { describe, expect, it } from "vitest";
import {
  experienceLabel,
  firstSentence,
  headline,
  identityFrom,
} from "@/features/workspace/identity";

const person = {
  fullName: "Asha Rao",
  preferredName: null,
  currentRole: "Senior Software Engineer",
  currentCompany: "Example Systems",
  yearsOfExperience: 5,
  currentCity: "Bengaluru",
  careerSummary: "Builds payment platforms. Leads backend reviews.",
  desiredRoles: [],
  preferredLocations: [],
};

describe("home identity", () => {
  it("prefers the preferred name and keeps the stored spelling", () => {
    expect(identityFrom({ ...person, preferredName: "Asha" }).name).toBe("Asha");
    expect(identityFrom({ ...person, fullName: "Rao, Asha" }).name).toBe("Rao, Asha");
  });
  it("searches desired roles and locations before current ones", () => {
    const identity = identityFrom({
      ...person,
      desiredRoles: ["Platform Engineer"],
      preferredLocations: ["Hyderabad"],
    });
    expect(identity.searchRole).toBe("Platform Engineer");
    expect(identity.searchCity).toBe("Hyderabad");
    expect(identityFrom(person).searchRole).toBe("Senior Software Engineer");
    expect(identityFrom(person).searchCity).toBe("Bengaluru");
  });
  it("returns empty values instead of guesses when no profile exists", () => {
    expect(identityFrom(undefined)).toEqual({
      name: "",
      role: "",
      company: "",
      years: null,
      city: "",
      summary: "",
      searchRole: "",
      searchCity: "",
    });
  });
  it("joins only the headline parts that exist", () => {
    expect(headline({ role: "Engineer", company: "Example" })).toBe("Engineer at Example");
    expect(headline({ role: "Engineer", company: "" })).toBe("Engineer");
    expect(headline({ role: "", company: "Example" })).toBe("Example");
  });
  it("words experience for one, many and fractional years", () => {
    expect(experienceLabel(1)).toBe("1 year experience");
    expect(experienceLabel(5)).toBe("5 years experience");
    expect(experienceLabel(5.5)).toBe("5.5 years experience");
  });
  it("keeps only the first sentence of the summary", () => {
    expect(firstSentence("Builds payment platforms. Leads backend reviews.")).toBe(
      "Builds payment platforms.",
    );
    expect(firstSentence("Ships fast! Reviews code.")).toBe("Ships fast!");
    expect(firstSentence("Version 2.5 of the platform")).toBe("Version 2.5 of the platform");
    expect(firstSentence("")).toBe("");
  });
});
