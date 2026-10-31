import { describe, expect, it } from "vitest";
import { isSharedSender, keywordProblem, ruleSchema, storedRule } from "./context";
import { evaluateCompanyMail, type CompanyMailRule, type MailEvidence } from "./company-rules";

const rule: CompanyMailRule = {
  company: "Northstar",
  aliases: ["Northstar India"],
  domains: ["northstar.example"],
  senders: [],
  keywords: [],
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
        bodyText: "Collect your course certificate. Explore careers with our partners.",
      }).destination,
    ).toBe("excluded");
  });
  it.each(["Inbox", "Archive", "Spam", "Junk Email", "Custom / Careers", "Deleted Items"])(
    "allows genuine updates from %s",
    (sourceFolder) => {
      expect(evaluate({ sourceFolder }).destination).toBe("latest");
    },
  );
  it("never resurfaces a tracked message even if folder or pattern changes", () => {
    expect(evaluate({ seen: true, sourceFolder: "Inbox" }).destination).toBe("history");
  });
  it("keeps old discoveries and explicit backfills in history", () => {
    expect(evaluate({ receivedAt: baseline }).destination).toBe("history");
    expect(evaluate({ receivedAt: "2020-01-01T00:00:00Z" }).destination).toBe("history");
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
  ])("excludes notification %s despite recruiting words in its body", (subject) => {
    expect(evaluate({ subject, contactedPersonReply: true }).destination).toBe("excluded");
  });
  it("requires an evidenced outgoing-contact reply for LinkedIn, not a familiar name or company footer", () => {
    const message = {
      sender: "messages-noreply@linkedin.com",
      subject: "Northstar recruiter sent you a message",
    };
    expect(evaluate(message).destination).toBe("excluded");
    expect(evaluate({ ...message, contactedPersonReply: true }).destination).toBe("latest");
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
  it("supports literal exclusions without regex", () => {
    expect(evaluate({}, { ...rule, excludedTerms: ["invitation"] }).destination).toBe("excluded");
  });
  it("does not promote mail with invalid dates", () => {
    expect(evaluate({ receivedAt: "unknown" }).destination).toBe("excluded");
  });
});

it.each([
  "Your invoice is ready",
  "Northstar billing report",
  "Your order has shipped",
  "CloudWatch alert",
  "Password reset code",
])("excludes non-hiring company notification %s", (subject) => {
  expect(
    evaluate({ subject, bodyText: "Visit our recruiting team and careers page." }).destination,
  ).toBe("excluded");
});
it("keeps an unstructured reply from an explicitly configured recruiting sender for manual review", () => {
  expect(
    evaluate(
      { subject: "Tuesday works", bodyText: "Thanks, talk then." },
      { ...rule, senders: [mail.sender] },
    ).destination,
  ).toBe("latest");
});
it("does not establish company identity from a body mention alone", () => {
  expect(
    evaluate({
      sender: "newsletter@external.invalid",
      subject: "Industry news",
      bodyText: "Northstar technical interview stories",
    }).destination,
  ).toBe("excluded");
});

describe("company keywords and specific reasons", () => {
  const ashby = { sender: "no-reply@ashbyhq.com", bodyText: "We'll be in touch." };
  it("keyword in the sender name is company evidence", () => {
    const fernwood = {
      ...rule,
      company: "Fernwood",
      domains: [],
      keywords: ["Fernwood Hiring Team"],
    };
    const decision = evaluate(
      { ...ashby, senderName: "Fernwood Hiring Team", subject: "Thanks for applying" },
      fernwood,
    );
    expect(decision.destination).not.toBe("excluded");
    expect(decision.evidence).toContain("Keyword in subject or sender name");
  });
  it("keyword in the body is not evidence", () => {
    const fernwood = {
      ...rule,
      company: "Fernwood",
      domains: [],
      keywords: ["Fernwood Hiring Team"],
    };
    const decision = evaluate(
      {
        ...ashby,
        senderName: "Ashby",
        subject: "Thanks for applying",
        bodyText: "Fernwood Hiring Team",
      },
      fernwood,
    );
    expect(decision.destination).toBe("excluded");
  });
  it("domain match with hiring words but no event is kept as Other", () => {
    expect(
      evaluate({
        subject: "Quick question about your notice period",
        bodyText: "Before we talk about the role, how long is it?",
      }).destination,
    ).not.toBe("excluded");
  });
  it("name in subject alone without an event is still dropped with a specific reason", () => {
    const amazon = { ...rule, company: "Amazon", aliases: [], domains: [] };
    const decision = evaluate(
      { sender: "store-news@amazon.in", subject: "Amazon Prime Day this weekend", bodyText: "" },
      amazon,
    );
    expect(decision.destination).toBe("excluded");
    expect(decision.reason).toBe(
      "Matched Amazon by company name in subject; no job event recognised",
    );
    expect(decision.evidence).toEqual(["Company name in subject"]);
  });
  it("refuses generic job words in any case", () => {
    expect(keywordProblem("  Interview ", "Northstar")).toBe(
      '"Interview" appears in every company\'s mail, so it can\'t identify Northstar. Try a phrase like "Northstar Talent".',
    );
    expect(keywordProblem("JOBS")).toEqual(expect.any(String));
    expect(keywordProblem("Northstar Talent")).toBeNull();
    const valid = { aliases: [], domains: [], senders: [], keywords: ["jobs"], excludedTerms: [] };
    expect(ruleSchema.safeParse(valid).success).toBe(false);
    expect(ruleSchema.safeParse({ ...valid, keywords: ["Northstar Talent"] }).success).toBe(true);
  });
  it("parses a legacy subjectTerms rule into keywords", () => {
    const legacy = {
      aliases: [],
      domains: [],
      senders: [],
      subjectTerms: ["SDE-2"],
      excludedTerms: [],
    };
    expect(ruleSchema.parse(legacy).keywords).toEqual(["SDE-2"]);
    expect(ruleSchema.parse(legacy)).not.toHaveProperty("subjectTerms");
  });
  it("keeps a stored rule's addresses when an old keyword is now refused", () => {
    const stored = {
      aliases: [],
      domains: ["northstar.example"],
      senders: ["talent@northstar.example"],
      subjectTerms: ["interview", "SDE-2"],
      excludedTerms: [],
    };
    expect(storedRule(stored)).toMatchObject({
      domains: ["northstar.example"],
      senders: ["talent@northstar.example"],
      keywords: ["SDE-2"],
    });
    expect(storedRule({ nonsense: true })).toBeNull();
  });
  it("recognises shared senders by domain or subdomain", () => {
    expect(isSharedSender("meera.k@gmail.com")).toBe(true);
    expect(isSharedSender("no-reply@us.greenhouse-mail.io")).toBe(false);
    expect(isSharedSender("noreply@mail.myworkday.com")).toBe(true);
    expect(isSharedSender("hireright.com")).toBe(true);
    expect(isSharedSender("talent@northstar.example")).toBe(false);
  });
});
