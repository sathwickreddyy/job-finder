import { describe, expect, it } from "vitest";
import { applyExplicitProfileResult, buildMissionContext, candidateForMission, discoverySchema, validateResult, type MissionResult } from "../src/features/missions/domain";
import { missionTemplate } from "../src/features/missions/templates";

const result: MissionResult = { status: "READY_FOR_REVIEW", summary: "Prepared", resultUrl: "", resumeVersionId: "", unknownQuestions: [], notes: "", evidenceUrls: [], applicationStage: "READY_FOR_REVIEW", humanConfirmed: false, structuredResult: {}, profileState: {}, approvedProfileFields: [] };
describe("mission boundaries", () => {
  it("discovery never exposes identity or compensation", () => {
    expect(candidateForMission("DISCOVER_JOBS", { fullName: "Private", primaryEmail: "private@test.com", currentCompensation: 100 }, { roles: ["Backend"], locations: ["Bengaluru"], privateNote: "secret" })).toEqual({ roles: ["Backend"], locations: ["Bengaluru"] });
  });
  it("application context preserves UNKNOWN and omits unrelated private data", () => {
    const candidate = candidateForMission("APPLY_JOB", { fullName: "Demo", phone: null, standardAnswers: { sponsorship: "UNKNOWN" }, currentCompensation: 100, additionalMetadata: { private: "secret" } });
    expect(candidate.phone).toBe("UNKNOWN"); expect(candidate.standardAnswers).toEqual({ sponsorship: "UNKNOWN" }); expect(candidate).not.toHaveProperty("currentCompensation"); expect(candidate).not.toHaveProperty("additionalMetadata");
  });
  it("contact missions receive no candidate identity", () => expect(candidateForMission("FIND_CONTACT", { fullName: "Private" })).toEqual({}));
  it("requires explicit human confirmation before APPLIED", () => {
    expect(() => validateResult("IN_PROGRESS", { ...result, applicationStage: "APPLIED" })).toThrow("explicit confirmation");
    expect(validateResult("IN_PROGRESS", { ...result, applicationStage: "APPLIED", humanConfirmed: true }).applicationStage).toBe("APPLIED");
  });
  it("unknown answers stop the mission and cannot be called reviewed or applied", () => {
    expect(validateResult("IN_PROGRESS", { ...result, applicationStage: "PREPARING", status: "COMPLETED", unknownQuestions: ["Work authorization?"] }).status).toBe("WAITING_FOR_USER");
    expect(() => validateResult("IN_PROGRESS", { ...result, applicationStage: "APPLIED", humanConfirmed: true, unknownQuestions: ["Work authorization?"] })).toThrow("Resolve unknown");
  });
  it("does not reset terminal mission state when recording a result", () => expect(() => validateResult("COMPLETED", result)).toThrow("closed"));
  it("profile results only patch approved target fields and preserve unrelated state", () => {
    const updated = applyExplicitProfileResult({ headline: "Old", skills: ["Python"], privateNote: "keep" }, { headline: "New" }, { headline: "New" }, ["headline"]);
    expect(updated.state).toEqual({ headline: "New", skills: ["Python"], privateNote: "keep" }); expect(updated.changes).toEqual([{ field: "headline", current: "Old", target: "New" }]);
    expect(() => applyExplicitProfileResult({ headline: "Old" }, { headline: "New" }, { headline: "New" }, [])).toThrow("Explicitly approve");
    expect(() => applyExplicitProfileResult({ headline: "Old" }, { headline: "New" }, { headline: "Made up" }, ["headline"])).toThrow("approved target");
    expect(() => applyExplicitProfileResult({ headline: "Old" }, { headline: "UNKNOWN" }, { headline: "UNKNOWN" }, ["headline"])).toThrow("unknown profile");
  });
  it("context uses stable real routes and excludes entity private metadata", () => {
    const plan = missionTemplate("APPLY_JOB", "Demo job");
    const context = buildMissionContext({ mission: { id: "test", type: "APPLY_JOB", status: "READY", title: plan.title, goal: plan.goal, priority: 2, entityType: "JOB", entityId: "job", input: {}, constraints: plan.constraints, expectedResult: plan.expectedResult }, entity: { id: "job", title: "Backend", notes: "private", canonicalUrl: "https://example.com" }, steps: plan.steps.map((step, index) => ({ ...step, sequence: index + 1, status: "PENDING" })) });
    expect(context.entity.data).not.toHaveProperty("notes"); expect(context.resultUrl).toBe("/missions/test/result"); expect(context.approvalRequirements).toContain("Stop before Submit");
  });
  it("validates discovery range and result limits", () => expect(discoverySchema.safeParse({ roles: ["Backend"], sources: ["NAUKRI"], experienceMin: 10, experienceMax: 2, maxResults: 30, freshnessDays: 7 }).success).toBe(false));
});
