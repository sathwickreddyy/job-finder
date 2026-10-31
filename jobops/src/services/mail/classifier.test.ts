import { describe, expect, it } from "vitest";
import { classifyMail } from "./classifier";
describe("deterministic mail classification", () => {
  it("recognizes acknowledgement, rejection, interview and assessment", () => {
    for (const [subject, type] of [
      ["Thank you for applying", "APPLICATION_ACKNOWLEDGEMENT"],
      ["We have decided not to proceed", "REJECTION"],
      ["Technical interview invitation", "INTERVIEW"],
      ["Online assessment", "ASSESSMENT"],
    ])
      expect(classifyMail({ subject }).type).toBe(type);
  });
  it("keeps vague unfortunately and ordinary offers unknown", () => {
    expect(classifyMail({ subject: "Unfortunately the office is closed" }).type).toBe("UNKNOWN");
    expect(classifyMail({ subject: "Special offer: 50% off" }).relevant).toBe(false);
    expect(classifyMail({ subject: "Update your mobile application" }).relevant).toBe(false);
  });
  it("recognises the job mail that used to be dropped", () => {
    for (const [subject, bodyText, type] of [
      ["Thank you for your application to Oracle", "", "APPLICATION_ACKNOWLEDGEMENT"],
      [
        "Thank you for your interest in Northstar",
        "Our team will review your profile and get back to you.",
        "APPLICATION_ACKNOWLEDGEMENT",
      ],
      ["Amazon Interview – CONFIRMATION", "", "INTERVIEW"],
      ["Feedback - Amazon Onsite Interview", "", "INTERVIEW_UPDATE"],
      ["Amazon Interview Preparation Call", "", "INTERVIEW_UPDATE"],
      ["Sathwick, REMINDER to complete your background screen for Amazon", "", "BACKGROUND_CHECK"],
      [
        "URGENT Request for Information – Your AMAZON INDIA Background Verification",
        "",
        "BACKGROUND_CHECK",
      ],
      ["Your joining details for Mon 4 April", "", "ONBOARDING"],
      ["Date of joining and pre-joining formalities", "", "ONBOARDING"],
      ["I've referred you for Backend Engineer II", "", "REFERRAL"],
      ["Referral submitted", "", "REFERRAL"],
    ])
      expect(classifyMail({ subject, bodyText }).type, subject).toBe(type);
  });
  it("treats a background-check vendor sender as a background check", () => {
    const result = classifyMail({ subject: "Action needed", sender: "noreply@fadv.com" });
    expect(result.type).toBe("BACKGROUND_CHECK");
    expect(result.confidence).toBe(0.9);
    expect(classifyMail({ subject: "Action needed", sender: "a@mail.hireright.com" }).type).toBe(
      "BACKGROUND_CHECK",
    );
  });
  it("requires review for conflicting event text", () => {
    const result = classifyMail({
      subject: "Interview invitation",
      bodyText: "Your previous application was rejected",
    });
    expect(result.type).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
