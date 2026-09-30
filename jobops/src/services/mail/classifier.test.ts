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
  it("requires review for conflicting event text", () => {
    const result = classifyMail({
      subject: "Interview invitation",
      bodyText: "Your previous application was rejected",
    });
    expect(result.type).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
