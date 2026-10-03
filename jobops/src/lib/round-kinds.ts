/** Interview round kinds shared by company research and the user's own applications. */
export const roundKinds = [
  "ONLINE_ASSESSMENT",
  "DSA",
  "LLD",
  "HLD",
  "BEHAVIORAL",
  "HIRING_MANAGER",
  "DOMAIN",
  "OTHER",
] as const;
export type RoundKind = (typeof roundKinds)[number];
