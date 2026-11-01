import { classifyMail } from "@/services/mail/classifier";

/** Shared policy for the live workspace and its component gallery. */
export type CompanyMailRule = {
  company: string;
  aliases: string[];
  domains: string[];
  senders: string[];
  /** Phrases that identify the company in a subject or sender name, such as "Fernwood Hiring Team". */
  keywords: string[];
  excludedTerms: string[];
};
export type MailEvidence = {
  subject: string;
  sender: string;
  /** The display name, which carries the company for mail sent through an ATS. */
  senderName?: string;
  bodyText: string;
  receivedAt: string;
  sourceFolder: string;
  seen: boolean;
  historical?: boolean;
  // These are resolved upstream from verified thread identity/outbound outreach.
  // A name mentioned anywhere in an email is insufficient evidence.
  linkedThread?: boolean;
  contactedPersonReply?: boolean;
};
export type SearchDecision = {
  destination: "latest" | "history" | "excluded";
  reason: string;
  evidence: string[];
};

const networking =
  /\b(?:invitation to connect|invited you to connect|wants to connect|want to connect|i still want to connect|new invitations|accept (?:my|their|the) invitation|people you may know|someone at .+ you may know|connection request|endorse(?:d|ment)|profile views?|viewed your profile|is hiring for a|job search filters|job recommendations|(?:job|hiring) alerts?|jobs for you|career advice|advice for entry-level|announcing our series|newsletter|sale|discount|course|webinar)\b/i;
const inboundHelp =
  /\b(?:can you refer me|could you refer me|refer me (?:to|for)|looking for a referral from you|can you help me (?:find|get|with) (?:a )?job|please review my (?:cv|resume))\b/i;
const linkedinDomains = ["linkedin.com", "linkedinmail.com"];
/** Hiring words in a subject; sender names like "Talent" and body footers don't count. */
const hiringWords =
  /\b(?:careers?|jobs?|roles?|positions?|openings?|hiring|recruit(?:er|ers|ing|ment)|talent|interviews?|assessment|candidate|applica(?:nt|tion)|appl(?:y|ied|ying)|notice period|ctc|compensation|resume|cv)\b/i;
/** Evidence strong enough to keep company mail as Other when no job event is recognised. */
const strongEvidence = [
  "Exact sender rule",
  "Company sender domain",
  "Keyword in subject or sender name",
];

function domainOf(address: string) {
  return address.trim().toLowerCase().split("@")[1] ?? "";
}
function domainMatches(domain: string, allowed: string) {
  const value = allowed.trim().toLowerCase().replace(/^@/, "");
  return Boolean(value && (domain === value || domain.endsWith(`.${value}`)));
}
function hasTerm(text: string, term: string) {
  const value = term.trim().toLowerCase();
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function evaluateCompanyMail(
  message: MailEvidence,
  rule: CompanyMailRule,
  baselineAt: string,
): SearchDecision {
  const exclude = (reason: string, evidence: string[] = []): SearchDecision => ({
    destination: "excluded",
    reason,
    evidence,
  });
  // Match only current-message text supplied by a parser; quoted history and
  // notification footers must not establish intent or contact identity.
  const text = `${message.subject}\n${message.bodyText}`;
  if (inboundHelp.test(text)) return exclude("Someone is asking you for job-search help");
  if (networking.test(message.subject))
    return exclude("Networking, digest or promotional notification");
  if (
    /\b(?:your latest .{1,80} jobs|(?:daily|weekly) (?:job|career) (?:updates?|digest)|jobs matching your (?:profile|preferences))\b/i.test(
      message.subject,
    ) ||
    (/\b(?:opted in to (?:job )?alerts|update your job preferences|manage (?:your )?job alerts)\b/i.test(
      message.bodyText,
    ) &&
      !/\b(?:your application|thank you for applying|your interview|your assessment)\b/i.test(text))
  )
    return exclude("Networking, digest or promotional notification");
  if (
    /\b(?:your (?:order|package)|order (?:confirmation|shipped|delivered)|invoice|billing|payment (?:received|due|successful)|service health|cloudwatch|cost report|usage report|security alert|password reset|sign.in code)\b/i.test(
      message.subject,
    ) &&
    !/\b(?:your application|your interview|your assessment|thank you for applying)\b/i.test(text)
  )
    return exclude("Shopping, billing or account notification without an application update");
  const domain = domainOf(message.sender);
  const linkedin = linkedinDomains.some((allowed) => domainMatches(domain, allowed));
  if (linkedin && !message.contactedPersonReply)
    return exclude("LinkedIn notification has no verified reply from someone you contacted");

  const evidence: string[] = [];
  if (message.linkedThread) evidence.push("Existing application thread");
  if (message.contactedPersonReply) evidence.push("Reply from a person you contacted");
  if (rule.senders.some((sender) => sender.trim().toLowerCase() === message.sender.toLowerCase()))
    evidence.push("Exact sender rule");
  if (!linkedin && rule.domains.some((allowed) => domainMatches(domain, allowed)))
    evidence.push("Company sender domain");
  const aliasMatch = [rule.company, ...rule.aliases].some((alias) =>
    hasTerm(message.subject, alias),
  );
  if (aliasMatch) evidence.push("Company name in subject");
  const senderName = message.senderName ?? "";
  if (
    rule.keywords.some(
      (keyword) => hasTerm(message.subject, keyword) || hasTerm(senderName, keyword),
    )
  )
    evidence.push("Keyword in subject or sender name");
  if (!evidence.length) return exclude("No company, application thread or contacted-person match");
  const excludedTerm = rule.excludedTerms.find((term) => hasTerm(text, term));
  if (excludedTerm)
    return exclude("Matches a company exclusion rule", [`Excluded phrase: ${excludedTerm}`]);

  // With no recognised event, keep company mail as Other only on strong evidence: an
  // exact sender, or the company's domain or keyword with hiring words in the subject.
  const event = classifyMail(message);
  const strong =
    evidence.includes("Exact sender rule") ||
    (evidence.some((item) => strongEvidence.includes(item)) && hiringWords.test(message.subject));
  if (
    (!event.relevant || event.type === "UNKNOWN") &&
    !strong &&
    !message.linkedThread &&
    !message.contactedPersonReply
  )
    return exclude(
      `Matched ${rule.company} by ${evidence
        .map((item) => item[0].toLowerCase() + item.slice(1))
        .join(" and ")}; no job event recognised`,
      evidence,
    );
  const received = Date.parse(message.receivedAt);
  const baseline = Date.parse(baselineAt);
  if (!Number.isFinite(received) || !Number.isFinite(baseline))
    return exclude("Message date or latest-check baseline is missing; review separately");
  if (message.seen || message.historical || received <= baseline)
    return {
      destination: "history",
      reason: message.seen
        ? "Already tracked; never new again"
        : "Historical match; kept out of Latest",
      evidence,
    };
  return {
    destination: "latest",
    reason: "New job-search update for this company",
    evidence,
  };
}
