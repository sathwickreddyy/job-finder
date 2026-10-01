import type { applicationStages } from "@/db/schema";
import { publicationYear, researchUrl, type ResearchFact } from "./research-data";

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
export const roundFamilies = ["Coding", "Design", "People", "Other"] as const;
export type RoundFamily = (typeof roundFamilies)[number];

export const roundKindLabel: Record<RoundKind, string> = {
  ONLINE_ASSESSMENT: "OA",
  DSA: "DSA",
  LLD: "LLD",
  HLD: "HLD",
  BEHAVIORAL: "Behavioral",
  HIRING_MANAGER: "HM",
  DOMAIN: "Domain",
  OTHER: "Other",
};

export function roundFamily(kind: RoundKind): RoundFamily {
  if (kind === "ONLINE_ASSESSMENT" || kind === "DSA") return "Coding";
  if (kind === "LLD" || kind === "HLD") return "Design";
  if (kind === "BEHAVIORAL" || kind === "HIRING_MANAGER") return "People";
  return "Other";
}

/** The stored round kind; legacy rows without one count as Other rather than being guessed. */
function roundKindOf(round: unknown): RoundKind {
  if (!round || typeof round !== "object") return "OTHER";
  const kind = (round as Record<string, unknown>).kind;
  return typeof kind === "string" && (roundKinds as readonly string[]).includes(kind)
    ? (kind as RoundKind)
    : "OTHER";
}

export type PayPoint = { value: number; level?: string; years?: number; sourceUrl: string };
export type PayStats = {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  points: PayPoint[];
};

function quantile(sorted: number[], q: number) {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function payStats(points: PayPoint[]): PayStats | null {
  if (!points.length) return null;
  const sorted = points.map((point) => point.value).sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
    points,
  };
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export type EquityGrant = {
  /** Total grant value; absent when the report states only a yearly value or units. */
  amount?: number;
  /** Currency of `amount`/`perYear`; absent for a units-only grant. */
  currency?: string;
  units?: number;
  type?: string;
  vestingYears?: number;
  perYear?: number;
  level?: string;
  sourceUrl: string;
};

export type CompanyMetrics = {
  fixed: PayStats | null;
  total: PayStats | null;
  variable: PayStats | null;
  variablePercent: number[];
  joiningBonus: PayStats | null;
  equity: EquityGrant[];
  benefits: { label: string; count: number }[];
  payReports: number;
  payNeedsReview: number;
  interviewReports: number;
  typicalRounds: number | null;
  roundsRange: [number, number] | null;
  styleMix: { family: RoundFamily; count: number }[];
  typicalLoop: RoundKind[];
  outcomes: { offer: number; rejected: number; other: number };
  topTopics: { topic: string; count: number }[];
};

function equityGrant(value: unknown): Omit<EquityGrant, "level" | "sourceUrl"> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const data = value as Record<string, unknown>;
  const currency =
    typeof data.currency === "string" && data.currency.trim()
      ? data.currency.toUpperCase()
      : undefined;
  // A value without its currency cannot be shown honestly; units can.
  const amount = currency && finite(data.amount) ? data.amount : undefined;
  const annual = currency && finite(data.annualAmount) ? data.annualAmount : undefined;
  const units = finite(data.units) && data.units > 0 ? data.units : undefined;
  if (amount === undefined && annual === undefined && units === undefined) return;
  const vestingYears = finite(data.vestingYears) ? data.vestingYears : undefined;
  return {
    amount,
    currency: amount !== undefined || annual !== undefined ? currency : undefined,
    units,
    type: typeof data.type === "string" ? data.type : undefined,
    vestingYears,
    perYear: annual ?? (amount !== undefined && vestingYears ? amount / vestingYears : undefined),
  };
}

export const interviewOutcomes = ["OFFER", "REJECTED", "PENDING", "WITHDREW", "UNKNOWN"] as const;
export type InterviewOutcome = (typeof interviewOutcomes)[number];

/** Accepts the contract enum, and reads legacy free text on rows still awaiting review. */
export function interviewOutcome(value: unknown): InterviewOutcome {
  if (typeof value !== "string") return "UNKNOWN";
  if ((interviewOutcomes as readonly string[]).includes(value)) return value as InterviewOutcome;
  const text = value.toLowerCase();
  if (/reject|not selected|no offer|declined by/.test(text)) return "REJECTED";
  if (/offer|accept|selected|cleared/.test(text)) return "OFFER";
  if (/withdr/.test(text)) return "WITHDREW";
  if (/pending|awaiting|waiting|in progress|freeze/.test(text)) return "PENDING";
  return "UNKNOWN";
}

export type InterviewRound = {
  name: string;
  kind: RoundKind;
  summary?: string;
  topics: string[];
  questions: { text: string; referenceUrl: string }[];
};
export type InterviewReport = {
  id: string;
  title: string;
  summary: string;
  role?: string;
  level?: string;
  years?: number;
  year: string;
  outcome: InterviewOutcome;
  roundCount: number;
  rounds: InterviewRound[];
  sourceUrl: string;
};

const texts = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];

export function interviewReports(facts: ResearchFact[]): InterviewReport[] {
  return facts
    .filter((fact) => fact.category === "INTERVIEW")
    .map((fact) => {
      const data = fact.data;
      const rounds: InterviewRound[] = (Array.isArray(data.rounds) ? data.rounds : []).map(
        (round, index) => {
          if (typeof round === "string")
            return { name: round, kind: "OTHER", topics: [], questions: [] };
          const row = (round && typeof round === "object" ? round : {}) as Record<string, unknown>;
          const name =
            typeof row.name === "string"
              ? row.name
              : typeof row.title === "string"
                ? row.title
                : `Round ${index + 1}`;
          const reference = researchUrl(row.referenceUrl) ?? fact.sourceUrl;
          return {
            name,
            kind: roundKindOf(row),
            summary: typeof row.summary === "string" ? row.summary : undefined,
            topics: texts(row.topics),
            questions: (Array.isArray(row.questions) ? row.questions : []).flatMap((item) => {
              const question = (item && typeof item === "object" ? item : {}) as Record<
                string,
                unknown
              >;
              const text = typeof item === "string" ? item : question.text;
              return typeof text === "string" && text.trim()
                ? [{ text, referenceUrl: researchUrl(question.referenceUrl) ?? reference }]
                : [];
            }),
          };
        },
      );
      return {
        id: fact.id,
        title: fact.title,
        summary: fact.summary,
        role: typeof data.role === "string" ? data.role : undefined,
        level: typeof data.level === "string" ? data.level : undefined,
        years: finite(data.yearsExperience) ? data.yearsExperience : undefined,
        year: publicationYear(data),
        outcome: interviewOutcome(data.outcome),
        roundCount:
          typeof data.roundCount === "number" && data.roundCount > 0
            ? data.roundCount
            : rounds.length,
        rounds,
        sourceUrl: fact.sourceUrl,
      };
    })
    .sort((a, b) => b.year.localeCompare(a.year));
}

export function companyMetrics(facts: ResearchFact[]): CompanyMetrics {
  const fixed: PayPoint[] = [];
  const total: PayPoint[] = [];
  const variable: PayPoint[] = [];
  const bonus: PayPoint[] = [];
  const variablePercent: number[] = [];
  const equity: EquityGrant[] = [];
  const benefits = new Map<string, number>();
  const pay = facts.filter((row) => row.category === "COMPENSATION");
  let payNeedsReview = 0;
  for (const fact of pay) {
    const data = fact.data;
    const level = typeof data.level === "string" ? data.level : undefined;
    const grant = equityGrant(data.equity) ?? equityGrant(data.equityOriginal);
    if (grant) equity.push({ ...grant, level, sourceUrl: fact.sourceUrl });
    if (Array.isArray(data.benefits))
      for (const label of data.benefits)
        if (typeof label === "string" && label.trim())
          benefits.set(label.trim(), (benefits.get(label.trim()) ?? 0) + 1);
    const inr = typeof data.currency === "string" && data.currency.toUpperCase() === "INR";
    if (!inr || !(finite(data.fixedAnnual) || finite(data.totalAnnual))) payNeedsReview++;
    if (!inr) continue;
    const base = {
      level,
      years: finite(data.yearsExperience) ? data.yearsExperience : undefined,
      sourceUrl: fact.sourceUrl,
    };
    if (finite(data.fixedAnnual)) fixed.push({ ...base, value: data.fixedAnnual });
    if (finite(data.totalAnnual)) total.push({ ...base, value: data.totalAnnual });
    // Zero means the report says there is none; it is not a data point for the range.
    if (finite(data.variableAnnual) && data.variableAnnual > 0)
      variable.push({ ...base, value: data.variableAnnual });
    if (finite(data.joiningBonus) && data.joiningBonus > 0)
      bonus.push({ ...base, value: data.joiningBonus });
    if (finite(data.variablePercent) && data.variablePercent <= 100)
      variablePercent.push(data.variablePercent);
  }

  const interviews = facts.filter((row) => row.category === "INTERVIEW");
  const loops = interviews.map((fact) =>
    Array.isArray(fact.data.rounds) ? fact.data.rounds.map(roundKindOf) : [],
  );
  const counts = interviews
    .map((fact, index) =>
      typeof fact.data.roundCount === "number" && fact.data.roundCount > 0
        ? fact.data.roundCount
        : loops[index].length,
    )
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  const typicalRounds = counts.length ? Math.round(quantile(counts, 0.5)) : null;

  const mix = new Map<RoundFamily, number>();
  for (const kind of loops.flat())
    mix.set(roundFamily(kind), (mix.get(roundFamily(kind)) ?? 0) + 1);

  const typicalLoop =
    typicalRounds === null
      ? []
      : ([...loops]
          .filter((loop) => loop.length)
          .sort(
            (a, b) =>
              Math.abs(a.length - typicalRounds) - Math.abs(b.length - typicalRounds) ||
              b.filter((kind) => kind !== "OTHER").length -
                a.filter((kind) => kind !== "OTHER").length,
          )[0] ?? []);

  const outcomes = { offer: 0, rejected: 0, other: 0 };
  for (const fact of interviews) {
    const outcome = interviewOutcome(fact.data.outcome);
    if (outcome === "OFFER") outcomes.offer++;
    else if (outcome === "REJECTED") outcomes.rejected++;
    else outcomes.other++;
  }

  const topics = new Map<string, number>();
  for (const fact of interviews) {
    const found = new Set<string>();
    const add = (value: unknown) => {
      if (Array.isArray(value))
        for (const topic of value)
          if (typeof topic === "string" && topic.trim()) found.add(topic.trim());
    };
    add(fact.data.topics);
    if (Array.isArray(fact.data.rounds))
      for (const round of fact.data.rounds)
        if (round && typeof round === "object") add((round as Record<string, unknown>).topics);
    for (const topic of found) topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }

  return {
    fixed: payStats(fixed),
    total: payStats(total),
    variable: payStats(variable),
    variablePercent,
    joiningBonus: payStats(bonus),
    equity,
    benefits: [...benefits]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    payReports: pay.length,
    payNeedsReview,
    interviewReports: interviews.length,
    typicalRounds,
    roundsRange: counts.length ? [counts[0], counts[counts.length - 1]] : null,
    styleMix: roundFamilies
      .map((family) => ({ family, count: mix.get(family) ?? 0 }))
      .filter((row) => row.count),
    typicalLoop,
    outcomes,
    topTopics: [...topics]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
      .slice(0, 8),
  };
}

export const pipelineStages = [
  "Not started",
  "Opening saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Closed",
] as const;
export type PipelineStage = (typeof pipelineStages)[number];
type ApplicationStage = (typeof applicationStages)[number];

const stageOf: Record<ApplicationStage, PipelineStage> = {
  DRAFT: "Opening saved",
  PREPARING: "Opening saved",
  READY_FOR_REVIEW: "Opening saved",
  APPLIED: "Applied",
  ACKNOWLEDGED: "Applied",
  ASSESSMENT: "Interviewing",
  RECRUITER_SCREEN: "Interviewing",
  TECHNICAL_INTERVIEW: "Interviewing",
  MANAGER_INTERVIEW: "Interviewing",
  FINAL_INTERVIEW: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Closed",
  WITHDRAWN: "Closed",
  CLOSED: "Closed",
};
const progressOrder: PipelineStage[] = ["Opening saved", "Applied", "Interviewing", "Offer"];

/** The furthest active stage wins; a company is Closed only when every application is closed. */
export function companyStage(statuses: string[], openingCount: number): PipelineStage {
  const stages = statuses.map((status) => stageOf[status as ApplicationStage] ?? "Opening saved");
  const active = stages.filter((stage) => stage !== "Closed");
  if (active.length)
    return active.reduce((best, stage) =>
      progressOrder.indexOf(stage) > progressOrder.indexOf(best) ? stage : best,
    );
  if (stages.length) return "Closed";
  return openingCount ? "Opening saved" : "Not started";
}

export const lpa = (rupees: number) => {
  const value = rupees / 100000;
  return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
};
