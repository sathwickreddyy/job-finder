import { expect, it } from "vitest";
import {
  classificationForTag,
  classificationsFor,
  parseTagParam,
  tagFromParam,
  tagLabel,
  tagMeaning,
  tagOf,
  tagsByStage,
  tagStage,
} from "./tags";

it("maps every classification to its new tag", () => {
  for (const [kind, tag] of [
    ["APPLICATION_ACKNOWLEDGEMENT", "application"],
    ["FOLLOW_UP", "application"],
    ["REFERRAL", "referral"],
    ["INTERVIEW", "interviewCall"],
    ["ASSESSMENT", "interviewCall"],
    ["INTERVIEW_UPDATE", "interviewProcess"],
    ["OFFER", "offer"],
    ["REJECTION", "applicationRejected"],
    ["INTERVIEW_REJECTION", "interviewRejected"],
    ["BACKGROUND_CHECK", "backgroundCheck"],
    ["ONBOARDING", "joining"],
    ["RECRUITER_OUTREACH", "opportunity"],
    ["UNKNOWN", "other"],
  ] as const)
    expect(tagOf(kind)).toBe(tag);
  expect(classificationsFor("interviewCall")).toEqual(["INTERVIEW", "ASSESSMENT"]);
  expect(tagStage.backgroundCheck).toBe("offerJoining");
  expect(tagStage.referral).toBe("before");
  expect(tagLabel.backgroundCheck).toBe("Background verification");
  expect(tagLabel.interviewCall).toBe("Interview call");
  expect(tagStage.interviewRejected).toBe("rejected");
  expect(tagLabel.applicationRejected).toBe("Application rejected");
  expect(tagLabel.interviewRejected).toBe("Rejected after interview");
});

it("reads new and legacy tag ids from links", () => {
  expect(parseTagParam("process")).toEqual(["application", "interviewCall", "interviewProcess"]);
  expect(parseTagParam("rejected")).toEqual(["applicationRejected", "interviewRejected"]);
  expect(parseTagParam("rejection")).toEqual(["applicationRejected", "interviewRejected"]);
  expect(tagFromParam("rejection")).toBe("applicationRejected");
  expect(parseTagParam("joining")).toEqual(["joining"]);
  expect(parseTagParam("bogus")).toBeNull();
});

it("retagging keeps a kind that already belongs to the tag", () => {
  expect(classificationForTag("interviewCall", "ASSESSMENT")).toBe("ASSESSMENT");
  expect(classificationForTag("interviewCall", "OFFER")).toBe("INTERVIEW");
  expect(classificationForTag("application", "OFFER")).toBe("FOLLOW_UP");
  expect(classificationForTag("application", "APPLICATION_ACKNOWLEDGEMENT")).toBe(
    "APPLICATION_ACKNOWLEDGEMENT",
  );
  expect(classificationForTag("offer", "INTERVIEW")).toBe("OFFER");
  expect(classificationForTag("joining", "OFFER")).toBe("ONBOARDING");
  expect(classificationForTag("other", "OFFER")).toBe("UNKNOWN");
});

it("lists every tag by stage with a meaning", () => {
  expect(tagsByStage).toEqual([
    "referral",
    "opportunity",
    "application",
    "applicationRejected",
    "interviewCall",
    "interviewProcess",
    "interviewRejected",
    "offer",
    "backgroundCheck",
    "joining",
    "other",
  ]);
  expect(tagMeaning.applicationRejected).toBe("Turned down before any interview.");
  expect(tagMeaning.interviewRejected).toBe("Turned down after one or more rounds.");
  expect(classificationForTag("interviewRejected", "REJECTION")).toBe("INTERVIEW_REJECTION");
});
