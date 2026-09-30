export type AttentionMessage = {
  classification: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  attentionState: string;
};
export function mailAttention(
  message: AttentionMessage,
): { reason: string; priority: number } | null {
  if (message.attentionState === "DONE") return null;
  if (message.classification === "REJECTION") return null;
  const text = `${message.subject}\n${message.snippet}\n${message.bodyText ?? ""}`;
  if (
    /\b(deadline|due by|expires? (?:on|in)|respond by|within \d+ hours|by tomorrow)\b/i.test(text)
  )
    return { priority: 1, reason: "Mentions a deadline — check the message for the exact date." };
  const reasons: Record<string, string> = {
    INTERVIEW: "Review the interview details and confirm your availability.",
    ASSESSMENT: "Check the assessment and its deadline.",
    OFFER: "Review the offer and any response date.",
    RECRUITER_OUTREACH: "A recruiter may be waiting for your reply.",
    FOLLOW_UP: "Review the next step for this conversation.",
  };
  return reasons[message.classification]
    ? {
        priority: ["INTERVIEW", "ASSESSMENT", "OFFER"].includes(message.classification) ? 1 : 2,
        reason: reasons[message.classification],
      }
    : null;
}
export function indiaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
export function mailDateGroup(receivedAt: Date, now = new Date()) {
  const today = indiaDate(now),
    received = indiaDate(receivedAt);
  if (received === today) return "Today";
  const local = new Date(`${today}T00:00:00+05:30`);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = indiaDate(new Date(local.getTime() - ((weekday + 6) % 7) * 86400000));
  return received >= monday ? "This week" : "Older";
}
export function indiaDayBoundary(value: string, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const result = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(result.valueOf()) || indiaDate(result) !== value) return undefined;
  return new Date(result.getTime() + (end ? 86400000 : 0));
}
