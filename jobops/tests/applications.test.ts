import { describe, it, expect } from "vitest";
import { applicationTransition, jobStateForApplication } from "@/features/applications/domain";
describe("application event creation", () => {
  it("requires human approval to record final submission", () =>
    expect(() => applicationTransition("READY_FOR_REVIEW", "APPLIED")).toThrow(/approved/));
  it("creates an auditable submission event", () =>
    expect(applicationTransition("READY_FOR_REVIEW", "APPLIED", true)).toMatchObject({
      eventType: "APPLICATION_SUBMITTED",
      payload: { previousStage: "READY_FOR_REVIEW", nextStage: "APPLIED", humanConfirmed: true },
    }));
  it("records rejection as a dedicated event", () =>
    expect(applicationTransition("TECHNICAL_INTERVIEW", "REJECTED").eventType).toBe(
      "REJECTION_RECEIVED",
    ));
  it("does not fabricate submission on a notes edit", () =>
    expect(applicationTransition("APPLIED", "APPLIED").eventType).toBe("APPLICATION_UPDATED"));
  it("retains truthful job state for imported recruiting stages", () => {
    expect(jobStateForApplication("ACKNOWLEDGED", "SHORTLISTED")).toBe("APPLIED");
    expect(jobStateForApplication("REJECTED", "APPLIED")).toBe("APPLIED");
    expect(jobStateForApplication("PREPARING", "APPLIED")).toBe("APPLIED");
  });
});
