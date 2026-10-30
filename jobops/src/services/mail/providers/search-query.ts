import type { ScanRequest } from "./types";

// Inputs are literal phrases, never raw provider operators or regexes.
const phrase = (value: string) => `"${value}"`;
export function gmailSearchQuery(request: ScanRequest) {
  const terms = ["-in:sent", "-in:drafts"];
  // Widen to whole seconds; the service enforces exact [since, until) bounds.
  if (request.since) terms.push(`after:${Math.floor(Date.parse(request.since) / 1000) - 1}`);
  terms.push(`before:${Math.ceil(Date.parse(request.until) / 1000)}`);
  for (const [field, values] of [
    ["", request.search?.keywords ?? []],
    ["from:", request.search?.senders ?? []],
    ["subject:", request.search?.subjects ?? []],
  ] as const) {
    if (values.length) terms.push(`{${values.map((v) => field + phrase(v)).join(" ")}}`);
  }
  return terms.join(" ");
}

export function outlookSearchQuery(request: ScanRequest): string | undefined {
  const filters = request.search;
  if (!filters || ![...filters.keywords, ...filters.senders, ...filters.subjects].length)
    return undefined; // Date-only scans use uncapped mailbox $filter pagination.
  const terms: string[] = [];
  for (const [field, values] of [
    ["", filters.keywords],
    ["from:", filters.senders],
    ["subject:", filters.subjects],
  ] as const) {
    if (values.length) terms.push(`(${values.map((v) => field + phrase(v)).join(" OR ")})`);
  }
  // KQL received dates have day precision. Widen one UTC day on both sides
  // to avoid losing timezone-edge messages, then enforce exact bounds locally.
  if (request.since)
    terms.push(
      `received>=${new Date(Date.parse(request.since) - 86400000).toISOString().slice(0, 10)}`,
    );
  terms.push(
    `received<=${new Date(Date.parse(request.until) + 86400000).toISOString().slice(0, 10)}`,
  );
  return JSON.stringify(terms.join(" AND "));
}
