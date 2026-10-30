import { describe, expect, it } from "vitest";
import {
  evaluateCompanyMail,
  type CompanyMailRule,
  type MailEvidence,
} from "./company-rules";

const rule: CompanyMailRule = {
  company: "Northstar",
  aliases: ["Northstar India"],
  domains: ["northstar.example"],
  senders: [],
  subjectTerms: [],
  excludedTerms: [],
};
const baseline = "2026-10-29T18:30:00.000Z";
const mail: MailEvidence = {
  subject: "Northstar interview invitation",
  sender: "talent@northstar.example",
  bodyText: "Please share your interview availability.",
  receivedAt: "2026-10-30T04:00:00.000Z",
  sourceFolder: "Spam",
  seen: false,
};
const evaluate = (changes: Partial<MailEvidence> = {}, config = rule) =>
  evaluateCompanyMail({ ...mail, ...changes }, config, baseline);

describe("company mail search policy", () => {
  it("does not accept a course notification because a footer mentions careers", () => {
    expect(
      evaluate({
        subject: "Your Northstar Credits, Badges & Certificate Are Ready",
        bodyText:
          "Collect your course certificate. Explore careers with our partners.",
      }).destination,
    ).toBe("excluded");
  });
  it.each([
    "Inbox",
    "Archive",
    "Spam",
    "Junk Email",
    "Custom / Careers",
    "Deleted Items",
  ])("allows genuine updates from %s", (sourceFolder) => {
    expect(evaluate({ sourceFolder }).destination).toBe("latest");
  });
  it("never resurfaces a tracked message even if folder or pattern changes", () => {
    expect(evaluate({ seen: true, sourceFolder: "Inbox" }).destination).toBe(
      "history",
    );
  });
  it("keeps old discoveries and explicit backfills in history", () => {
    expect(evaluate({ receivedAt: baseline }).destination).toBe("history");
    expect(evaluate({ receivedAt: "2020-01-01T00:00:00Z" }).destination).toBe(
      "history",
    );
    expect(evaluate({ historical: true }).destination).toBe("history");
  });
  it.each([
    "Someone at Northstar you may know",
    "I still want to connect",
    "You have 10+ new invitations",
    "Northstar is hiring for a Remote role",
    "Advice for Entry-Level Candidates from Northstar Recruiters",
    "Announcing our Series B",
    "Your latest Northstar jobs",
    "Northstar Hiring Alert!",
    "Weekly job digest",
  ])(
    "excludes notification %s despite recruiting words in its body",
    (subject) => {
      expect(
        evaluate({ subject, contactedPersonReply: true }).destination,
      ).toBe("excluded");
    },
  );
  it("requires an evidenced outgoing-contact reply for LinkedIn, not a familiar name or company footer", () => {
    const message = {
      sender: "messages-noreply@linkedin.com",
      subject: "Northstar recruiter sent you a message",
    };
    expect(evaluate(message).destination).toBe("excluded");
    expect(
      evaluate({ ...message, contactedPersonReply: true }).destination,
    ).toBe("latest");
  });
  it("keeps brief replies to your own outreach even without recruiting keywords", () => {
    expect(
      evaluate({
        subject: "Re: Hello",
        bodyText: "Send me your CV.",
        sender: "someone@example.net",
        contactedPersonReply: true,
      }).destination,
    ).toBe("latest");
  });
  it("excludes requests asking the user for a referral", () => {
    expect(
      evaluate({
        bodyText: "Can you refer me for a software role?",
        contactedPersonReply: true,
      }).destination,
    ).toBe("excluded");
  });
  it("does not accept domain suffix attacks or unbounded company substrings", () => {
    expect(
      evaluate({
        sender: "person@evilnorthstar.example",
        subject: "Interview invitation",
      }).destination,
    ).toBe("excluded");
    expect(
      evaluate({
        sender: "person@example.net",
        subject: "Northstarlight interview invitation",
      }).destination,
    ).toBe("excluded");
  });
  it("requires job intent even with a company sender", () => {
    expect(
      evaluate({
        subject: "Northstar account password",
        bodyText: "Reset your password",
      }).destination,
    ).toBe("excluded");
  });
  it("supports required subject terms and literal exclusions without regex", () => {
    expect(evaluate({}, { ...rule, subjectTerms: ["SDE-2"] }).destination).toBe(
      "excluded",
    );
    expect(
      evaluate({}, { ...rule, excludedTerms: ["invitation"] }).destination,
    ).toBe("excluded");
  });
  it("does not promote mail with invalid dates", () => {
    expect(evaluate({ receivedAt: "unknown" }).destination).toBe("excluded");
  });
});

it.each(["Your invoice is ready", "Northstar billing report", "Your order has shipped", "CloudWatch alert", "Password reset code"])("excludes non-hiring company notification %s", (subject) => {
  expect(evaluate({ subject, bodyText: "Visit our recruiting team and careers page." }).destination).toBe("excluded");
});
it("keeps an unstructured reply from an explicitly configured recruiting sender for manual review", () => {
  expect(evaluate({ subject: "Tuesday works", bodyText: "Thanks, talk then." }, { ...rule, senders: [mail.sender] }).destination).toBe("latest");
});
it("does not establish company identity from a body mention alone", () => {
  expect(evaluate({ sender: "newsletter@external.invalid", subject: "Industry news", bodyText: "Northstar technical interview stories" }).destination).toBe("excluded");
});
