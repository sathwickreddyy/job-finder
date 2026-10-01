import type { companyFacts } from "@/db/schema";

export type ResearchFact = typeof companyFacts.$inferSelect;
export const researchLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();

export function publicationYear(data: Record<string, unknown>): string {
  if (
    typeof data.publicationYear === "number" &&
    Number.isInteger(data.publicationYear) &&
    data.publicationYear >= 1900 &&
    data.publicationYear <= 9999
  )
    return String(data.publicationYear);
  if (
    typeof data.publishedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(data.publishedAt) &&
    Number.isFinite(Date.parse(data.publishedAt))
  )
    return data.publishedAt.slice(0, 4);
  return "Not recorded";
}

export function compensationAmount(value: unknown, currency: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not recorded";
  const amount = value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (typeof currency !== "string" || !currency.trim()) return amount + " (currency not recorded)";
  return currency.toUpperCase() === "INR" ? "₹" + amount : currency.toUpperCase() + " " + amount;
}

export function researchUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password)
      return url.toString();
  } catch {
    /* Older imported fields can be incomplete. */
  }
}

export type InterviewQuestion = {
  text: string;
  round?: string;
  topic?: string;
  referenceUrl: string;
};

export function interviewQuestions(fact: ResearchFact): InterviewQuestion[] {
  const result: InterviewQuestion[] = [];
  function collect(value: unknown, round?: string, reference?: string) {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const details = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const text = typeof item === "string" ? item : details.text;
      if (typeof text !== "string" || !text.trim()) continue;
      result.push({
        text,
        round: typeof details.round === "string" ? details.round : round,
        topic: typeof details.topic === "string" ? details.topic : undefined,
        referenceUrl: researchUrl(details.referenceUrl) ?? reference ?? fact.sourceUrl,
      });
    }
  }
  collect(fact.data.questions);
  if (Array.isArray(fact.data.rounds))
    fact.data.rounds.forEach((round, index) => {
      if (!round || typeof round !== "object") return;
      const data = round as Record<string, unknown>;
      const name =
        typeof data.name === "string"
          ? data.name
          : typeof data.title === "string"
            ? data.title
            : "Round " + (index + 1);
      collect(data.questions, name, researchUrl(data.referenceUrl));
    });
  return result;
}
