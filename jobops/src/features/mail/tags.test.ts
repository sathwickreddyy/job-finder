import { expect, it } from "vitest";
import { classificationForTag, classificationsFor, tagLabel, tagOf } from "./tags";

it("maps every classification to its tag", () => {
  expect(tagOf("RECRUITER_OUTREACH")).toBe("opportunity");
  for (const kind of [
    "APPLICATION_ACKNOWLEDGEMENT",
    "FOLLOW_UP",
    "ASSESSMENT",
    "INTERVIEW",
  ] as const)
    expect(tagOf(kind)).toBe("process");
  expect(tagOf("OFFER")).toBe("offer");
  expect(tagOf("REJECTION")).toBe("rejected");
  expect(tagOf("UNKNOWN")).toBe("other");
  expect(classificationsFor("process")).toEqual([
    "APPLICATION_ACKNOWLEDGEMENT",
    "FOLLOW_UP",
    "ASSESSMENT",
    "INTERVIEW",
  ]);
  expect(tagLabel).toEqual({
    opportunity: "Job opportunity",
    process: "Application / interview",
    offer: "Offer",
    rejected: "Rejected",
    other: "Other",
  });
});

it("retagging to process keeps an existing process kind", () => {
  expect(classificationForTag("process", "INTERVIEW")).toBe("INTERVIEW");
  expect(classificationForTag("process", "OFFER")).toBe("FOLLOW_UP");
  expect(classificationForTag("offer", "INTERVIEW")).toBe("OFFER");
  expect(classificationForTag("other", "OFFER")).toBe("UNKNOWN");
});
