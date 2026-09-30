import type { mailClassifications } from "@/db/schema";

export type MailClassification = (typeof mailClassifications)[number];
export type MailClassificationResult = {
  type: MailClassification;
  confidence: number;
  reasons: string[];
  relevant: boolean;
};
const rules: { type: MailClassification; confidence: number; patterns: RegExp[] }[] = [
  {
    type: "REJECTION",
    confidence: 0.96,
    patterns: [
      /\b(?:we (?:have )?decided not to (?:proceed|move forward)|not (?:been )?selected|will not be (?:moving|proceeding)|unable to move forward|application (?:was |has been )?(?:unsuccessful|rejected))\b/i,
    ],
  },
  {
    type: "OFFER",
    confidence: 0.93,
    patterns: [
      /\b(?:offer of employment|employment offer|offer letter|pleased to offer you|job offer)\b/i,
    ],
  },
  {
    type: "INTERVIEW",
    confidence: 0.9,
    patterns: [
      /\b(?:interview (?:availability|invitation|scheduled|with|for)|technical interview|schedule (?:an |your |the )?interview|invite you (?:for|to) (?:an )?interview)\b/i,
    ],
  },
  {
    type: "ASSESSMENT",
    confidence: 0.86,
    patterns: [
      /\b(?:coding (?:assessment|challenge|test)|online assessment|complete (?:the |an |our )?assessment|assessment invitation)\b/i,
    ],
  },
  {
    type: "APPLICATION_ACKNOWLEDGEMENT",
    confidence: 0.94,
    patterns: [
      /\b(?:thank you for applying|application (?:has been |was )?received|we (?:have )?received your application|thanks for your application)\b/i,
    ],
  },
  {
    type: "RECRUITER_OUTREACH",
    confidence: 0.7,
    patterns: [
      /\b(?:recruiting team|recruiter|hiring for|career opportunity|interested in (?:a |this )?(?:role|opportunity)|explore (?:a |an )?(?:role|opportunity))\b/i,
    ],
  },
  {
    type: "FOLLOW_UP",
    confidence: 0.6,
    patterns: [
      /\b(?:following up on your application|application (?:status|update)|next steps (?:for|in) (?:your|the) (?:application|hiring))\b/i,
    ],
  },
];

export function classifyMail(message: {
  subject: string;
  bodyText?: string | null;
  snippet?: string | null;
}): MailClassificationResult {
  const text = `${message.subject}\n${message.bodyText ?? ""}\n${message.snippet ?? ""}`;
  const matched = rules.filter((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  if (!matched.length)
    return {
      type: "UNKNOWN",
      confidence: 0.2,
      reasons: ["No clear recruiting event phrase matched"],
      relevant:
        /\b(?:recruiter|recruiting|interview|hiring|career|job opportunity|assessment|application (?:for|status|update)|(?:job|role|position) application)\b/i.test(
          text,
        ),
    };
  const conflicting = matched.filter((rule) =>
    ["REJECTION", "OFFER", "INTERVIEW", "ASSESSMENT"].includes(rule.type),
  );
  if (conflicting.length > 1)
    return {
      type: "UNKNOWN",
      confidence: 0.35,
      reasons: [`Conflicting event phrases: ${conflicting.map((rule) => rule.type).join(", ")}`],
      relevant: true,
    };
  const chosen = matched[0];
  return {
    type: chosen.type,
    confidence: chosen.confidence,
    reasons: [`Matched deterministic ${chosen.type.toLowerCase().replaceAll("_", " ")} phrase`],
    relevant: true,
  };
}
