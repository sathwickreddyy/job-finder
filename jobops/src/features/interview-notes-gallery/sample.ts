import type { InterviewGalleryData, LibraryEntry } from "./types";

/*
 * Committed sample so the gallery works without private data. Real interview notes
 * load from STORAGE_ROOT/gallery-fixtures/interview-notes.json when present.
 */
const twoSum = {
  id: "s-q1",
  title: "Two sum, return indices",
  patterns: ["Hash map"],
  prompt:
    "Given an integer array `nums` and a `target`, return the indices of the two numbers that add up to `target`.\n\n- Exactly one solution exists\n- Do not use the same element twice",
  answer:
    "**Approach:** one pass with a map from value to index.\n\n```python\nseen = {}\nfor i, x in enumerate(nums):\n    if target - x in seen:\n        return [seen[target - x], i]\n    seen[x] = i\n```",
  howItWent: "code" as const,
  time: "O(n)",
  space: "O(n)",
  interviewer: "Asked for the brute force first, then accepted the map.",
  review: "Correct. Mention the brute force O(n²) briefly before optimising; it shows the trade-off.",
};

const mergeIntervals = {
  id: "s-q2",
  title: "Merge overlapping intervals",
  patterns: ["Sorting", "Intervals"],
  prompt: "Given a list of intervals, merge all overlapping intervals.",
  answer:
    "Sort by start, then extend the last merged interval while the next one overlaps.\n\nStopped coding after the sort; explained the merge loop.",
  howItWent: "aloud" as const,
  time: "O(n log n)",
  space: "O(n)",
  interviewer: "Satisfied with the explanation; moved on.",
};

export const sampleData: InterviewGalleryData = {
  real: false,
  applications: [
    {
      id: "sample-a",
      company: "Northwind",
      role: "Senior Software Engineer",
      req: "R-20431",
      location: "Bengaluru · hybrid",
      appliedOn: "2026-11-03",
      phase: "Interviewing",
      postingUrl: "https://example.com/jobs/r-20431",
      resume: {
        filename: "Resume_northwind-r20431_2026-11-03.pdf",
        label: "Northwind SSE · R-20431 · tailored 3 Nov",
      },
      mail: [
        { subject: "Interview invite: Northwind coding round", date: "2026-11-12" },
        { subject: "Thanks for applying to Northwind", date: "2026-11-04" },
      ],
      history: [
        { date: "2026-11-16", text: "Completed round 1 (coding)." },
        { date: "2026-11-11", text: "Round 1 booked for 16 Nov, 12:00 pm." },
        { date: "2026-11-04", text: "Application acknowledged." },
        { date: "2026-11-03", text: "Applied directly." },
      ],
      rounds: [
        {
          id: "s-r1",
          position: 1,
          name: "Coding",
          at: "2026-11-16T06:30:00.000Z",
          result: "due",
          questions: [twoSum, mergeIntervals],
        },
      ],
      expectedLoop: [
        { name: "System design", source: "Sample interview report" },
        { name: "Hiring manager", source: "Sample interview report" },
        { name: "HR", source: "Sample interview report" },
      ],
    },
    {
      id: "sample-b",
      company: "Northwind",
      role: "Senior Software Engineer",
      req: "R-19877",
      location: "Hyderabad · hybrid",
      appliedOn: "2026-10-27",
      phase: "Acknowledged",
      postingUrl: "https://example.com/jobs/r-19877",
      resume: {
        filename: "Resume_backend-platform_2026-10-03.pdf",
        label: "Backend & data platforms · 3 Oct",
      },
      mail: [{ subject: "Thanks for applying to Northwind", date: "2026-10-28" }],
      history: [
        { date: "2026-11-04", text: "Sent a follow-up." },
        { date: "2026-10-28", text: "Application acknowledged." },
        { date: "2026-10-27", text: "Applied directly." },
      ],
      rounds: [],
      expectedLoop: [],
    },
  ],
  library: [],
};

/** Extra rows so the library can be scrolled, searched and filtered. Always labelled as samples. */
export const sampleLibrary: LibraryEntry[] = [
  { ...twoSum, company: "Northwind", role: "Senior Software Engineer", roundName: "Coding", date: "2026-11-16", sample: true },
  { ...mergeIntervals, company: "Northwind", role: "Senior Software Engineer", roundName: "Coding", date: "2026-11-16", sample: true },
  ...(
    [
      ["LRU cache", ["Hash map", "Linked list"], "code", "O(1)", "O(n)", "Contoso", "Coding", "2026-10-22"],
      ["Design a URL shortener", ["System design"], "aloud", "—", "—", "Contoso", "System design", "2026-10-29"],
      ["Top K frequent elements", ["Heap", "Hash map"], "code", "O(n log k)", "O(n)", "Fabrikam", "Coding", "2026-10-14"],
      ["Longest palindromic substring", ["Two pointers"], "partial", "O(n²)", "O(1)", "Fabrikam", "Coding", "2026-10-14"],
      ["Tell me about a disagreement with a teammate", ["Behavioural"], "aloud", "—", "—", "Tailspin", "Hiring manager", "2026-10-09"],
      ["Rate limiter for an API gateway", ["System design"], "partial", "—", "—", "Tailspin", "System design", "2026-10-07"],
      ["Number of islands", ["Graph", "BFS"], "code", "O(mn)", "O(mn)", "Woodgrove", "Coding", "2026-09-30"],
    ] as const
  ).map(([title, patterns, howItWent, time, space, company, roundName, date], index) => ({
    id: `sample-lib-${index}`,
    title,
    patterns: [...patterns],
    prompt: `${title}.`,
    answer: "Sample entry.",
    howItWent,
    time,
    space,
    interviewer: "",
    company,
    role: "Software Engineer",
    roundName,
    date,
    sample: true,
  })),
];
