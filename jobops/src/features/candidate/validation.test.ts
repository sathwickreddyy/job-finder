import { describe, expect, it } from "vitest";
import { explicitAnswer, jobPreferencesSchema, standardAnswersSchema } from "./validation";
describe("canonical answers", () => {
  it("retains unknown and converts blank answers without guessing", () => { expect(explicitAnswer(undefined)).toBe("UNKNOWN"); expect(standardAnswersSchema.parse({ Sponsorship: "", Authorization: "UNKNOWN", Relocation: " No " })).toEqual({ Sponsorship: "UNKNOWN", Authorization: "UNKNOWN", Relocation: "No" }); });
  it("rejects reversed experience bounds", () => { expect(jobPreferencesSchema.safeParse({ desiredRoles: [], locations: [], remotePreference: "UNKNOWN", minExperience: 8, maxExperience: 4, preferredTechnologies: [], excludedRoles: [] }).success).toBe(false); });
});
