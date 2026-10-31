import type { ScanRequest } from "./types";

/** What identifies a company in a provider search, all literal phrases. */
export type SearchIdentity = {
  /** The company name and aliases: searched in the subject and the sender. */
  names: string[];
  /** Recruiter keywords: searched anywhere; the sorter counts only subject and sender name. */
  keywords: string[];
  senders: string[];
  domains: string[];
};
export type SearchRequest = ScanRequest & { identity: SearchIdentity };

/** A search term as a literal phrase. Quotes, backslashes and control characters are refused. */
export function assertPhrase(value: string): string {
  const phrase = value.trim();
  if (!phrase || /["\\\u0000-\u001f\u007f]/.test(phrase))
    throw new Error(`"${phrase}" can't be searched: remove quotes, backslashes and line breaks.`);
  return phrase;
}
const quoted = (value: string) => `"${assertPhrase(value)}"`;
function terms({ identity }: SearchRequest) {
  return [
    ...identity.senders.map((value) => `from:${quoted(value)}`),
    ...identity.domains.map((value) => `from:${quoted(value)}`),
    ...identity.names.flatMap((value) => [`subject:${quoted(value)}`, `from:${quoted(value)}`]),
    ...identity.keywords.map(quoted),
  ];
}

/** Gmail `q`. Bounds widen to whole seconds; the provider enforces the exact window. */
export function gmailSearchQuery(request: SearchRequest): string {
  const parts = ["-in:sent", "-in:drafts"];
  if (request.since) parts.push(`after:${Math.floor(Date.parse(request.since) / 1000) - 1}`);
  parts.push(`before:${Math.ceil(Date.parse(request.until) / 1000)}`);
  parts.push(`{${terms(request).join(" ")}}`);
  return parts.join(" ");
}

/**
 * Graph `$search` KQL, JSON-quoted. KQL dates are whole days, so the window widens one UTC
 * day on each side and the provider enforces the exact bounds.
 */
export function outlookSearchQuery(request: SearchRequest): string {
  const parts = [`(${terms(request).join(" OR ")})`];
  const day = (at: number) => new Date(at).toISOString().slice(0, 10);
  if (request.since) parts.push(`received>=${day(Date.parse(request.since) - 86_400_000)}`);
  parts.push(`received<=${day(Date.parse(request.until) + 86_400_000)}`);
  return JSON.stringify(parts.join(" AND "));
}

/** Search results keep only mail inside [since, until] that isn't sent mail or a draft. */
export function inWindow(
  request: ScanRequest,
  message: { receivedAt: string; contextOnly?: boolean },
) {
  const at = Date.parse(message.receivedAt);
  return (
    !message.contextOnly &&
    at <= Date.parse(request.until) &&
    (!request.since || at >= Date.parse(request.since))
  );
}
