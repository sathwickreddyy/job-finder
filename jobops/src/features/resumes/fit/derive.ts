import {
  isToolSource,
  toolDetailsSchema,
  type LexicalDetails,
  type OptimizerDetails,
  type ResumeNextDetails,
  type ToolSource,
} from "./tools";

// Display-only derivations over recorded tool output. No term matching happens here.
export type ToolRow = {
  versionId: string;
  snapshotId: string;
  source: ToolSource;
  score: number | null;
  method: string;
  details: unknown;
  createdAt: Date;
};
export type ParsedRow = ToolRow & { parsed: LexicalDetails | ResumeNextDetails | OptimizerDetails };

export function parseToolRow(
  row: { source: string; details: unknown } & Omit<ToolRow, "source" | "details">,
): ParsedRow | null {
  if (!isToolSource(row.source)) return null;
  const result = toolDetailsSchema[row.source].safeParse(row.details);
  return result.success ? { ...row, source: row.source, parsed: result.data } : null;
}

export function latestBySource(rows: ParsedRow[], versionId: string, snapshotId: string) {
  const latest: Partial<Record<ToolSource, ParsedRow>> = {};
  for (const row of rows) {
    if (row.versionId !== versionId || row.snapshotId !== snapshotId) continue;
    const seen = latest[row.source];
    if (!seen || row.createdAt > seen.createdAt) latest[row.source] = row;
  }
  return latest;
}

export type Breakdown = {
  label: string;
  mine: number | null;
  base: number | null;
  target?: number;
};
export type ToolSummary =
  | { score: number | null; baseScore: number | null; delta: number | null; breakdown: Breakdown[] }
  | { notChecked: true };

const round1 = (n: number) => Math.round(n * 10) / 10;

function breakdownFor(source: ToolSource, mine: ParsedRow, base?: ParsedRow): Breakdown[] {
  if (source === "jobops-lexical") {
    const m = mine.parsed as LexicalDetails;
    const b = base?.parsed as LexicalDetails | undefined;
    return [
      { label: "Required terms", mine: m.required, base: b?.required ?? null },
      { label: "Preferred terms", mine: m.preferred, base: b?.preferred ?? null },
      { label: "All terms", mine: m.keyword, base: b?.keyword ?? null },
    ];
  }
  if (source === "resumenext") {
    const b = base?.parsed as ResumeNextDetails | undefined;
    return (mine.parsed as ResumeNextDetails).categories.map((c) => ({
      label: `${c.label} (${c.points}/${c.max})`,
      mine: c.percent,
      base: b?.categories.find((x) => x.id === c.id)?.percent ?? null,
    }));
  }
  return [
    {
      label: "Required keywords",
      mine: (mine.parsed as OptimizerDetails).match_score,
      base: (base?.parsed as OptimizerDetails | undefined)?.match_score ?? null,
      target: 80,
    },
  ];
}

export function summarizeTool(source: ToolSource, mine?: ParsedRow, base?: ParsedRow): ToolSummary {
  if (!mine) return { notChecked: true };
  const score = mine.score;
  const baseScore = base?.score ?? null;
  return {
    score,
    baseScore,
    delta: score !== null && baseScore !== null ? round1(score - baseScore) : null,
    breakdown: breakdownFor(source, mine, base),
  };
}

export type Chip = {
  term: string;
  importance: "required" | "preferred";
  closeness: "exact" | "close" | "unclear" | "missing";
  isNew: boolean;
  quote: string;
  evidence: string[];
  note?: string;
  where?: { count: number; places: string[] };
};

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export function deriveChips(
  mine: LexicalDetails,
  base?: LexicalDetails,
  optimizer?: OptimizerDetails,
): Chip[] {
  return mine.findings.map((f) => {
    const requirement = mine.requirements.find((r) => same(r.term, f.term));
    const closeness =
      f.status === "not_evidenced"
        ? "missing"
        : f.status === "unclear"
          ? "unclear"
          : f.resume_evidence.some((e) => same(e.text, f.term))
            ? "exact"
            : "close";
    const before = base?.findings.find((b) => same(b.term, f.term));
    const keyword = optimizer?.keywords.find((k) => same(k.term, f.term));
    const chip: Chip = {
      term: f.term,
      importance: f.importance,
      closeness,
      isNew: f.status === "mentioned" && before?.status === "not_evidenced",
      quote: requirement?.jd_quote ?? "",
      evidence: [...new Set(f.resume_evidence.map((e) => e.context))].slice(0, 2),
    };
    if (closeness === "missing" && requirement?.note) chip.note = requirement.note;
    if (keyword && keyword.found > 0)
      chip.where = {
        count: keyword.found,
        places: (["summary", "skills", "experience"] as const).filter((p) => keyword.where[p] > 0),
      };
    return chip;
  });
}
