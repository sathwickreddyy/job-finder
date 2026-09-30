import { applicationStages } from "@/db/schema";
export type ApplicationStage = (typeof applicationStages)[number];
export const recordMethods = ["DIRECT", "REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"] as const;
export const methodNames: Record<string, string> = {
  DIRECT: "Direct application",
  REFERRAL: "Referral",
  COLD_EMAIL: "Cold email",
  LINKEDIN_MESSAGE: "LinkedIn message",
};
export function recordIntent(method: string, sent: boolean) {
  if (!recordMethods.includes(method as (typeof recordMethods)[number]))
    throw new Error("Choose an application or outreach method.");
  const applied = method === "DIRECT" && sent;
  return {
    applied,
    status: applied ? ("APPLIED" as const) : ("PREPARING" as const),
    eventType: !sent ? "ACTION_PLANNED" : applied ? "APPLICATION_SUBMITTED" : "OUTREACH_SENT",
  };
}
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
