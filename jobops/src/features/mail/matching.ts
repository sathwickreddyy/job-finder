import { classifyMail } from "@/services/mail/classifier";
import { currentMessageText } from "@/services/mail/providers/plain-text";
import type { ScannedMessage } from "@/services/mail/providers/types";
import { evaluateCompanyMail } from "./search-policy";
import type { MailContext } from "./context";

export type Match = {
  disposition: "latest" | "history" | "excluded";
  reason: string;
  evidence: string[];
  companyKeys: string[];
  applicationIds: string[];
};
const normalized = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function matchMail(
  message: ScannedMessage,
  context: MailContext,
  options: {
    historical: boolean;
    seen: boolean;
    threadApplications?: string[];
  },
): Match {
  const excluded = (reason: string): Match => ({
    disposition: "excluded",
    reason,
    evidence: [],
    companyKeys: [],
    applicationIds: [],
  });
  if (message.contextOnly)
    return excluded("Sent mail and drafts are context only");
  const bodyText = currentMessageText(message.bodyText ?? "");
  const linkedin =
    /@(?:[a-z0-9-]+\.)*(?:linkedin\.com|linkedinmail\.com)$/i.test(
      message.sender,
    );
  // Only an exact identity in the notification header or subject can match a
  // recorded outgoing recipient. Names in recommendations/body footers do not count.
  const notificationName = message.senderName
    ?.replace(/\s*\(?via LinkedIn\)?\s*$/i, "")
    .trim();
  const subjectName = message.subject.match(
    /^(.{3,100}?) (?:sent you a message|replied to your message|messaged you)(?:[.!:]|$)/i,
  )?.[1];
  const direct = context.outbound.filter(
    (person) =>
      !linkedin && person.email?.toLowerCase() === message.sender.toLowerCase(),
  );
  const social = context.outbound.filter(
    (person) =>
      linkedin &&
      person.name &&
      [notificationName, subjectName].some(
        (name) =>
          name &&
          normalized(name) === normalized(person.name!) &&
          normalized(name).split(" ").length >= 2,
      ),
  );
  // Same-name recipients in different companies are ambiguous.
  const socialCompanies = new Set(social.map((person) => person.company));
  const contacted = linkedin
    ? socialCompanies.size === 1
      ? social
      : []
    : direct;
  const hits = context.companies.map((company) => {
    const threadApplications = (options.threadApplications ?? []).filter((id) =>
      context.applications.some(
        (app) => app.id === id && app.company === company.id,
      ),
    );
    const ownContacts = contacted.filter(
      (person) => person.company === company.id,
    );
    const result = evaluateCompanyMail(
      {
        subject: message.subject,
        sender: message.sender,
        bodyText,
        receivedAt: message.receivedAt,
        sourceFolder: message.folders.join(", "),
        seen: options.seen,
        historical: options.historical,
        linkedThread: threadApplications.length > 0,
        contactedPersonReply: ownContacts.length > 0,
      },
      company.rule,
      company.baselineAt,
    );
    return { company, result, threadApplications, ownContacts };
  });
  const matches = hits.filter((hit) => hit.result.destination !== "excluded");
  if (matches.length > 1)
    return excluded("Ambiguous company match; refine sender and subject rules");
  if (!matches.length) {
    const policyExclusion = hits.find((hit) => [
      "Matches a company exclusion rule", "Subject does not match the saved company pattern",
      "Someone is asking you for job-search help", "Networking, digest or promotional notification",
      "Shopping, billing or account notification without an application update",
    ].includes(hit.result.reason));
    if (policyExclusion) return { ...excluded(policyExclusion.result.reason), evidence: policyExclusion.result.evidence };
    // A genuine update about the user's own application can predate a saved
    // company/application record. Keep it in the cumulative view for manual
    // association, without manufacturing a company or application.
    const event = classifyMail({ ...message, bodyText });
    const personal =
      /\b(?:your application|you(?:'|’)ve applied|thank you for applying|we (?:have )?received your application|your (?:technical )?interview|your (?:online )?assessment|offer you (?:the |a )?(?:position|role))\b/i.test(
        `${message.subject}\n${bodyText}`,
      );
    const hiringContext =
      /\b(?:careers?|jobs?|roles?|positions?|hiring|recruit(?:er|ing|ment)?|talent|interview|assessment|candidate|engineer|developer|sde)\b/i.test(
        `${message.subject}\n${message.sender}\n${message.senderName ?? ""}\n${bodyText}`,
      );
    const otherApplication =
      /\b(?:emi|credit card|loan application|insurance application|admission|visa application)\b/i.test(
        message.subject,
      ) ||
      /\b(?:your (?:loan|credit card|insurance|visa|admission) application|application for (?:a |the )?(?:loan|credit card|insurance|visa|admission))\b/i.test(
        bodyText,
      );
    if (
      !linkedin &&
      personal &&
      hiringContext &&
      !otherApplication &&
      event.confidence >= 0.85 &&
      !["UNKNOWN", "RECRUITER_OUTREACH"].includes(event.type)
    ) {
      const result = evaluateCompanyMail(
        {
          subject: message.subject,
          sender: message.sender,
          bodyText,
          receivedAt: message.receivedAt,
          sourceFolder: message.folders.join(", "),
          seen: options.seen,
          historical: options.historical,
        },
        {
          company: "",
          aliases: [],
          domains: [],
          senders: [message.sender],
          subjectTerms: [],
          excludedTerms: [],
        },
        context.baselineAt,
      );
      if (result.destination !== "excluded")
        return {
          disposition: result.destination,
          reason:
            "Personal application update; company/application needs manual association",
          evidence: [
            "Explicit update about your application",
            `Recognized ${event.type.toLowerCase().replaceAll("_", " ")}`,
          ],
          companyKeys: [],
          applicationIds: [],
        };
    }
    return excluded(
      linkedin
        ? "LinkedIn networking, digest or unverified reply; no matching outgoing recipient"
        : (hits.find((hit) => hit.result.reason.includes("asking you"))?.result
            .reason ??
            "No hiring update matched a saved company, application or outgoing contact"),
    );
  }
  const { company, result, threadApplications, ownContacts } = matches[0];
  const apps = context.applications.filter((app) => app.company === company.id);
  let applicationIds = [
    ...new Set([
      ...threadApplications,
      ...ownContacts.map((person) => person.applicationId),
    ]),
  ];
  if (!applicationIds.length) {
    const text = normalized(`${message.subject}\n${bodyText}`);
    const roleMatches = apps.filter(
      (app) =>
        text.includes(normalized(app.role)) && normalized(app.role).length >= 5,
    );
    if (roleMatches.length === 1) applicationIds = [roleMatches[0].id];
    else if (
      apps.length === 1 &&
      classifyMail({ ...message, bodyText }).type !== "RECRUITER_OUTREACH"
    )
      applicationIds = [apps[0].id];
  }
  return {
    disposition: result.destination,
    reason: result.reason,
    evidence: result.evidence,
    companyKeys: [company.id],
    applicationIds,
  };
}
