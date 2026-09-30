import { describe, expect, it } from "vitest";
import { indiaDayBoundary, mailAttention, mailDateGroup } from "@/features/mail/attention";
describe("mail attention", () => {
  const base = { subject: "Hello", snippet: "", bodyText: null, attentionState: "OPEN" };
  it("distinguishes actions from acknowledgements and closed messages", () => {
    expect(mailAttention({ ...base, classification: "APPLICATION_ACKNOWLEDGEMENT" })).toBeNull();
    expect(mailAttention({ ...base, classification: "INTERVIEW" })?.priority).toBe(1);
    expect(
      mailAttention({ ...base, classification: "INTERVIEW", attentionState: "DONE" }),
    ).toBeNull();
    expect(
      mailAttention({ ...base, classification: "REJECTION", subject: "Your deadline has passed" }),
    ).toBeNull();
  });
  it("flags deadline language without inventing a calendar deadline", () => {
    expect(
      mailAttention({ ...base, classification: "UNKNOWN", subject: "Please respond by tomorrow" })
        ?.reason,
    ).toContain("exact date");
  });
  it("groups near-midnight mail by India date and Monday week boundary", () => {
    const now = new Date("2026-10-01T01:00:00Z");
    expect(mailDateGroup(new Date("2026-09-30T19:00:00Z"), now)).toBe("Today");
    expect(mailDateGroup(new Date("2026-09-29T09:00:00Z"), now)).toBe("This week");
    expect(mailDateGroup(new Date("2026-09-27T09:00:00Z"), now)).toBe("Older");
    expect(indiaDayBoundary("2026-10-01")?.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(indiaDayBoundary("2026-02-31")).toBeUndefined();
  });
});
