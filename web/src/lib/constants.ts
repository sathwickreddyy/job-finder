// Mirrors app/storage/sqlite_store.py STATUS_RANK. Order matters for sorts.
export const STATUS_RANK = {
  Interviewing: 0,
  "Assessment Pending": 1,
  "Recruiter Reply": 2,
  Applied: 3,
  "Tailoring Resume": 4,
  "Need Referral": 5,
  Shortlisted: 6,
  Found: 7,
  Rejected: 8,
  Archived: 9,
} as const;

export type ApplicationStatus = keyof typeof STATUS_RANK;
export const ALL_STATUSES = Object.keys(STATUS_RANK) as ApplicationStatus[];
export const ALL_PRIORITIES = ["P0", "P1", "P2", "Ignore"] as const;
export type Priority = (typeof ALL_PRIORITIES)[number];
