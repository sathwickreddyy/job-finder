import { describe, expect, it } from "vitest";
import {
  explicitAnswer,
  jobPreferencesSchema,
  missionPrioritySchema,
  safeMissionPriority,
  standardAnswersSchema,
} from "./validation";
describe("canonical answers", () => {
  it("retains unknown and converts blank answers without guessing", () => {
    expect(explicitAnswer(undefined)).toBe("UNKNOWN");
    expect(
      standardAnswersSchema.parse({
        Sponsorship: "",
        Authorization: "UNKNOWN",
        Relocation: " No ",
      }),
    ).toEqual({ Sponsorship: "UNKNOWN", Authorization: "UNKNOWN", Relocation: "No" });
  });
  it("rejects reversed experience bounds", () => {
    expect(
      jobPreferencesSchema.safeParse({
        desiredRoles: [],
        locations: [],
        remotePreference: "UNKNOWN",
        minExperience: 8,
        maxExperience: 4,
        preferredTechnologies: [],
        excludedRoles: [],
      }).success,
    ).toBe(false);
  });
  it("accepts the same three priority levels as mission forms and safely handles legacy defaults", () => {
    expect([1, 2, 3].map((value) => missionPrioritySchema.parse(String(value)))).toEqual([1, 2, 3]);
    expect(missionPrioritySchema.safeParse("4").success).toBe(false);
    expect(missionPrioritySchema.safeParse("5").success).toBe(false);
    expect(safeMissionPriority(1)).toBe(1);
    expect([undefined, 0, 4, 5, 1.5, true, "invalid"].map(safeMissionPriority)).toEqual([
      2, 2, 2, 2, 2, 2, 2,
    ]);
  });
});
