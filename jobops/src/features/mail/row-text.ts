// Zero-width characters, soft hyphens and similar marks that marketing mail pads its first line with.
const invisible =
  /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯﻿]/g;
const greeting =
  /^(hi|hello|hey|dear|greetings|good (morning|afternoon|evening))\b[^.!?]{0,40}[,!:]?$/i;

/** The first line that says something: no greetings, no invisible preheader padding. */
export function previewLine(text: string) {
  return (
    text
      .split("\n")
      .map((line) => line.replace(invisible, "").replace(/\s+/g, " ").trim())
      .find((line) => line && !greeting.test(line)) ?? ""
  );
}

/** Each inbox by what tells it apart: its domain, or the whole address when a domain repeats. */
export function inboxLabels(accounts: string[]) {
  const unique = [...new Set(accounts.filter(Boolean))];
  const domain = (account: string) => account.split("@")[1] ?? account;
  const seen = new Map<string, number>();
  for (const account of unique) seen.set(domain(account), (seen.get(domain(account)) ?? 0) + 1);
  return Object.fromEntries(
    unique.map((account) => [account, seen.get(domain(account)) === 1 ? domain(account) : account]),
  );
}
