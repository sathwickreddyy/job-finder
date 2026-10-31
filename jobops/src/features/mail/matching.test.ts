import { describe, expect, it } from "vitest";
import { matchMail } from "./matching";
import type { MailContext } from "./context";
import type { ScannedMessage } from "@/services/mail/providers/types";
const context: MailContext = {
  baselineAt: "2026-10-29T18:30:00Z",
  companies: [
    {
      id: "acme",
      name: "Acme",
      slug: "acme",
      baselineAt: "2026-10-29T18:30:00Z",
      ruleSource: "test",
      rule: {
        company: "Acme",
        aliases: [],
        domains: ["acme.example"],
        senders: [],
        keywords: [],
        excludedTerms: [],
      },
    },
  ],
  applications: [
    {
      id: "sde",
      company: "acme",
      role: "Software Engineer II",
      recipient: "Priya Sharma",
      sentAt: "2026-10-20T00:00:00Z",
    },
    {
      id: "backend",
      company: "acme",
      role: "Backend Engineer",
      recipient: null,
      sentAt: null,
    },
  ],
  outbound: [
    {
      applicationId: "sde",
      company: "acme",
      name: "Priya Sharma",
      email: "priya@acme.example",
    },
  ],
};
const message: ScannedMessage = {
  externalId: "immutable",
  sender: "talent@acme.example",
  senderName: "Talent",
  subject: "Interview invitation",
  bodyText: "Please share your availability",
  receivedAt: "2026-10-30T04:00:00Z",
  folders: ["Spam"],
};
describe("production mail matching evidence", () => {
  it("does not apply an unrelated company's exclusion pattern to an unassigned application update", () => {
    const own = structuredClone(context);
    own.companies[0].rule.excludedTerms = ["engineer"];
    const result = matchMail(
      {
        ...message,
        sender: "careers@elsewhere.invalid",
        subject: "We received your application",
        bodyText: "Thank you for applying to the Software Engineer role.",
      },
      own,
      { historical: false, seen: false },
    );
    expect(result.disposition).toBe("latest");
    expect(result.companyKeys).toEqual([]);
  });
  it("does not treat a personal loan/card application as a hiring update", () => {
    expect(
      matchMail(
        {
          ...message,
          sender: "cards@bank.invalid",
          subject: "Your credit card application",
          bodyText: "We received your application. See careers on our website.",
        },
        { ...context, companies: [] },
        { historical: false, seen: false },
      ).disposition,
    ).toBe("excluded");
  });
  it("retains personal application updates for an untracked company without creating a company", () => {
    const update = {
      ...message,
      sender: "careers@untracked.invalid",
      subject: "We received your application",
      bodyText: "Thank you for applying to the Engineer role.",
    };
    const result = matchMail(
      update,
      { ...context, companies: [] },
      { historical: false, seen: false },
    );
    expect(result.disposition).toBe("latest");
    expect(result.companyKeys).toEqual([]);
    expect(result.applicationIds).toEqual([]);
    expect(
      matchMail(update, { ...context, companies: [] }, { historical: true, seen: false })
        .disposition,
    ).toBe("history");
  });
  it("does not bypass an explicit company exclusion for a personal update", () => {
    const restricted = structuredClone(context);
    restricted.companies[0].rule.excludedTerms = ["internship"];
    expect(
      matchMail(
        {
          ...message,
          subject: "Your application for the internship",
          bodyText: "Thank you for applying",
        },
        restricted,
        { historical: false, seen: false },
      ).disposition,
    ).toBe("excluded");
  });
  it("matches a company without guessing between two roles", () => {
    const result = matchMail(message, context, {
      historical: false,
      seen: false,
    });
    expect(result.companyKeys).toEqual(["acme"]);
    expect(result.applicationIds).toEqual([]);
  });
  it("uses a unique role mention or linked thread to identify the application", () => {
    expect(
      matchMail({ ...message, subject: "Software Engineer II interview invitation" }, context, {
        historical: false,
        seen: false,
      }).applicationIds,
    ).toEqual(["sde"]);
    expect(
      matchMail(message, context, {
        historical: false,
        seen: false,
        threadApplications: ["backend"],
      }).applicationIds,
    ).toEqual(["backend"]);
  });
  it("requires an exact outgoing recipient identity in the LinkedIn header", () => {
    const reply = {
      ...message,
      sender: "messages-noreply@linkedin.com",
      senderName: "Priya Sharma (via LinkedIn)",
      subject: "Priya Sharma sent you a message",
      bodyText: "Send me your CV.",
    };
    expect(matchMail(reply, context, { historical: false, seen: false }).applicationIds).toEqual([
      "sde",
    ]);
    expect(
      matchMail(
        {
          ...reply,
          senderName: "LinkedIn",
          subject: "You have a message",
          bodyText: "Send me your CV.\nPeople you may know: Priya Sharma",
        },
        context,
        { historical: false, seen: false },
      ).disposition,
    ).toBe("excluded");
    expect(
      matchMail(reply, { ...context, outbound: [] }, { historical: false, seen: false })
        .disposition,
    ).toBe("excluded");
  });
  it("excludes inbound referral requests even from an outgoing contact", () => {
    expect(
      matchMail(
        {
          ...message,
          sender: "priya@acme.example",
          bodyText: "Can you refer me for a role?",
        },
        context,
        { historical: false, seen: false },
      ).disposition,
    ).toBe("excluded");
  });
  it("does not let quoted old hiring text establish intent", () => {
    expect(
      matchMail(
        {
          ...message,
          subject: "Re: Hello",
          bodyText: "Please unsubscribe me\nOn Monday wrote:\nInterview invitation",
        },
        context,
        { historical: false, seen: false },
      ).disposition,
    ).toBe("excluded");
  });
  it("keeps historical matches out of Latest, irrespective of folder or provider read state", () => {
    expect(matchMail(message, context, { historical: true, seen: false }).disposition).toBe(
      "history",
    );
    expect(
      matchMail({ ...message, folders: ["Inbox"] }, context, {
        historical: false,
        seen: true,
      }).disposition,
    ).toBe("history");
  });
  it("holds shared ATS sender matches across companies for review", () => {
    const shared = structuredClone(context);
    shared.companies.push({
      ...shared.companies[0],
      id: "other",
      name: "Other",
      rule: { ...shared.companies[0].rule, company: "Other" },
    });
    expect(matchMail(message, shared, { historical: false, seen: false }).reason).toContain(
      "Ambiguous",
    );
  });
});

describe("specific reasons on dropped mail", () => {
  const oracle: MailContext = {
    baselineAt: "2026-10-29T18:30:00Z",
    applications: [],
    outbound: [],
    companies: [
      {
        id: "oracle",
        name: "Oracle",
        slug: "oracle",
        baselineAt: "2026-10-29T18:30:00Z",
        ruleSource: "test",
        rule: {
          company: "Oracle",
          aliases: [],
          domains: ["oracle.com"],
          senders: [],
          keywords: [],
          excludedTerms: [],
        },
      },
    ],
  };
  const options = { historical: false, seen: false };
  it("reports the matched company's reason and key on exclusion", () => {
    const result = matchMail(
      {
        ...message,
        sender: "events@example.net",
        senderName: "Events",
        subject: "Oracle meetup",
        bodyText: "Join us",
      },
      oracle,
      options,
    );
    expect(result.disposition).toBe("excluded");
    expect(result.reason).toMatch(/^Matched Oracle/);
    expect(result.companyKeys).toEqual(["oracle"]);
  });
  it('keeps "Thank you for your application to Oracle"', () => {
    const result = matchMail(
      {
        ...message,
        sender: "oracle-hcm@oracle.com",
        senderName: "Oracle",
        subject: "Thank you for your application to Oracle",
        bodyText: "We will review it.",
      },
      oracle,
      options,
    );
    expect(result.disposition).toBe("latest");
    expect(result.companyKeys).toEqual(["oracle"]);
  });
  it("keeps the generic reason only when no company had any evidence", () => {
    const result = matchMail(
      {
        ...message,
        sender: "news@example.net",
        senderName: "News",
        subject: "Weekend reading",
        bodyText: "",
      },
      oracle,
      options,
    );
    expect(result.reason).toBe(
      "No hiring update matched a saved company, application or outgoing contact",
    );
    expect(result.companyKeys).toEqual([]);
  });
});

it("never guesses a previous job as an email's role", () => {
  const own: MailContext = {
    ...context,
    applications: [
      {
        id: "prev",
        company: "acme",
        role: "SDE I",
        recipient: null,
        sentAt: null,
        closed: true,
        previousJob: { joinedOn: "2022-04" },
      },
    ],
    outbound: [],
  };
  expect(matchMail(message, own, { historical: false, seen: false }).applicationIds).toEqual([]);
});
