import { applicationStages } from "@/db/schema";
export type ApplicationStage = (typeof applicationStages)[number];
export function jobStateForApplication(
  stage: ApplicationStage,
  previous: "NEW" | "REVIEWING" | "SHORTLISTED" | "IGNORED" | "PREPARING" | "APPLIED" | "CLOSED",
) {
  if (
    [
      "APPLIED",
      "ACKNOWLEDGED",
      "ASSESSMENT",
      "RECRUITER_SCREEN",
      "TECHNICAL_INTERVIEW",
      "MANAGER_INTERVIEW",
      "FINAL_INTERVIEW",
      "OFFER",
    ].includes(stage)
  )
    return "APPLIED" as const;
  if (["REJECTED", "WITHDRAWN", "CLOSED"].includes(stage) || previous === "APPLIED")
    return previous;
  return "PREPARING" as const;
}
export function applicationTransition(
  previous: ApplicationStage,
  next: ApplicationStage,
  humanConfirmed = false,
) {
  if (next === "APPLIED" && previous !== "APPLIED" && !humanConfirmed)
    throw new Error(
      "Confirm that final submission was explicitly approved before marking APPLIED.",
    );
  const types: Partial<Record<ApplicationStage, string>> = {
    APPLIED: "APPLICATION_SUBMITTED",
    ACKNOWLEDGED: "ACKNOWLEDGEMENT_RECEIVED",
    ASSESSMENT: "ASSESSMENT_RECEIVED",
    RECRUITER_SCREEN: "INTERVIEW_REQUESTED",
    TECHNICAL_INTERVIEW: "INTERVIEW_SCHEDULED",
    MANAGER_INTERVIEW: "INTERVIEW_SCHEDULED",
    FINAL_INTERVIEW: "INTERVIEW_SCHEDULED",
    REJECTED: "REJECTION_RECEIVED",
    OFFER: "OFFER_RECEIVED",
  };
  return {
    eventType: previous === next ? "APPLICATION_UPDATED" : (types[next] ?? "STAGE_CHANGED"),
    payload: { previousStage: previous, nextStage: next, humanConfirmed },
    summary:
      previous === next ? `Updated application in ${next}` : `Moved from ${previous} to ${next}`,
  };
}
