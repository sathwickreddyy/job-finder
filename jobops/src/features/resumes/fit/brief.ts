import { splitIssues } from "./issues";
import { mustHaveRows } from "./must-haves";
import type { FitGroup } from "./service";
import type { LexicalDetails, OptimizerDetails, ResumeNextDetails } from "./tools";

// What an agent reads when it opens a résumé: assembled from recorded checks, never scored here.
export type FileRef = { versionId: string; label: string; docxPath: string | null };
type Importance = "required" | "preferred";
type BriefTerm = { term: string; importance: Importance; jdQuote: string };
type Pair = { revised: number | null; current: number | null };

export type Brief = {
  job: {
    snapshotId: string;
    target: { url: string; company: string; title: string; description: string };
  };
  startFrom: FileRef;
  revision: FileRef | null;
  scores: {
    keywordCheck: Pair;
    atsOptimizer: Pair & { mustHavesFound: number | null; mustHaves: number };
    resumeNext: Pair;
  };
  askUserFirst: (BriefTerm & { status: "missing" | "unclear" })[];
  keepOut: (BriefTerm & { reason: string })[];
  addExperienceBullet: string[];
  fixIssues: { label: string; hint: string; severity: string }[];
  keepAsIs: { label: string; reason: string }[];
  rules: string[];
};

export const BRIEF_RULES = [
  "Ask the user about every askUserFirst term in the chat, one at a time, before writing. Use only what they confirm, in their words.",
  "Truthful re-weighting only: never add skills, metrics or keywords the user hasn't confirmed.",
  "Edit a copy of the DOCX at startFrom.docxPath. If it is null, ask the user where it is and record it with PATCH /api/v1/resumes/{startFrom.versionId} { docxPath }. Keep the changes the revision already made (its DOCX is at revision.docxPath when set), keep the layout, and list every change you make. Save the result as a new DOCX; never overwrite the original.",
  "Export a text-based PDF and upload it as a new version on the Résumés page.",
  "Link the new version with POST /api/v1/resumes/{newVersionId}/fit: send job.target unchanged with snapshotId = job.snapshotId, baseVersionId = startFrom.versionId, docxPath = the new DOCX and no assessments. Then run POST /api/v1/resumes/{newVersionId}/score with { snapshotId: job.snapshotId, tool } for each of jobops-lexical, resumenext and resume-ats-optimizer.",
  "keepOut and keepAsIs reasons carry over to the new version when /score runs, so the user isn't asked again. If you record assessments yourself, include those reasons.",
  "Scores are tool diagnostics, not an employer's ATS.",
];

const lower = (s: string) => s.toLocaleLowerCase();
const rank = (i: Importance) => (i === "required" ? 0 : 1);

export function buildBrief(
  group: Omit<FitGroup, "brief">,
  files: { revised: FileRef; current: FileRef | null },
): Brief | null {
  const lexical = group.mine["jobops-lexical"]?.parsed as LexicalDetails | undefined;
  if (!lexical) return null;
  const optimizer = group.mine["resume-ats-optimizer"]?.parsed as OptimizerDetails | undefined;
  const resumenext = group.mine.resumenext?.parsed as ResumeNextDetails | undefined;
  const requirement = (term: string) =>
    lexical.requirements.find((r) => lower(r.term) === lower(term));
  const open = lexical.findings
    .filter((f) => f.status !== "mentioned")
    .sort((a, b) => rank(a.importance) - rank(b.importance));
  const term = (f: (typeof open)[number]): BriefTerm => ({
    term: f.term,
    importance: f.importance,
    jdQuote: requirement(f.term)?.jd_quote ?? "",
  });
  const required = lexical.findings.filter((f) => f.importance === "required");
  const issues = splitIssues(resumenext?.issues ?? []);
  const score = (source: "jobops-lexical" | "resume-ats-optimizer" | "resumenext"): Pair => ({
    revised: group.mine[source]?.score ?? null,
    current: files.current ? (group.base[source]?.score ?? null) : null,
  });
  return {
    job: {
      snapshotId: group.snapshotId,
      target: {
        url: group.target.url,
        company: group.target.company,
        title: group.target.title,
        description: group.snapshot.description,
      },
    },
    startFrom: files.current ?? files.revised,
    revision: files.current ? files.revised : null,
    scores: {
      keywordCheck: score("jobops-lexical"),
      atsOptimizer: {
        ...score("resume-ats-optimizer"),
        mustHavesFound: optimizer
          ? optimizer.keywords.filter((k) => k.importance === "required" && k.found > 0).length
          : null,
        mustHaves: required.length,
      },
      resumeNext: score("resumenext"),
    },
    askUserFirst: open
      .filter((f) => !requirement(f.term)?.note)
      .map((f) => ({
        ...term(f),
        status: f.status === "unclear" ? ("unclear" as const) : ("missing" as const),
      })),
    keepOut: open
      .filter((f) => requirement(f.term)?.note)
      .map((f) => ({ ...term(f), reason: requirement(f.term)!.note! })),
    addExperienceBullet: mustHaveRows(group)
      .filter((r) => r.state === "add-bullet")
      .map((r) => r.term),
    fixIssues: issues.fix.map((i) => ({ label: i.label, hint: i.hint, severity: i.severity })),
    keepAsIs: issues.keep.map((i) => ({ label: i.label, reason: i.reason })),
    rules: BRIEF_RULES,
  };
}
