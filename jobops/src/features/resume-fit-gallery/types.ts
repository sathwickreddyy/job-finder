export type Match = "exact" | "alias" | "missing";

export type Requirement = {
  term: string;
  aliases?: string[];
  importance: "required" | "preferred";
  jd_quote: string;
  tailored: { match: Match; evidence: string[] };
  master: { match: Match; evidence: string[] };
};

export type Lexical = { keyword: number; required: number; preferred: number; weighted: number };

export type ToolSide = {
  lexical: Lexical;
  lexicalMissing: string[];
  resumenext: {
    score: number;
    grade: string;
    gradeLabel: string;
    categories: { id: string; label: string; percent: number; points: number; max: number }[];
    issues: { label: string; hint: string; severity: "urgent" | "important" | "optional" }[];
    coverage: number;
    matched: string[];
    missing: string[];
    entries: number;
  };
  atsOptimizer: {
    match_score: number | null;
    target: number;
    format: { check: string; ok: boolean; warn?: boolean; detail: string }[];
    keywords: {
      term: string;
      importance: string;
      found: number;
      where: { summary: number; skills: number; experience: number };
    }[];
  };
};

export type Change = {
  kind: "reworded" | "moved" | "added" | "dropped";
  where: string;
  before: string | null;
  after: string | null;
  from?: number;
  to?: number;
};

export type FitOpening = {
  slug: string;
  company: string;
  title: string;
  location: string;
  url: string;
  applyUrl?: string;
  reqId?: string;
  postedAt: string;
  postedAtKind: "original" | "latest_publication";
  versionId: string;
  versionLabel: string;
  masterId: string;
  requirements: Requirement[];
  master: ToolSide;
  tailored: ToolSide;
  changes: Change[];
  jdExcerpt: string;
  jdLength: number;
};
