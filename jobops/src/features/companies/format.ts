import { Columns3, LayoutGrid, Rows3 } from "lucide-react";
import {
  lpa,
  type CompanyMetrics,
  type EquityGrant,
  type PayStats,
  type RoundFamily,
} from "./metrics";

export const familyFill: Record<RoundFamily, string> = {
  Coding: "bg-chart-coding",
  Design: "bg-chart-design",
  People: "bg-chart-people",
  Other: "bg-chart-other",
};
export const initials = (name: string) => (name === "ServiceNow" ? "SN" : name.slice(0, 2));
export const payRange = (stats: PayStats | null) =>
  stats
    ? stats.n === 1
      ? `₹${lpa(stats.median)} LPA`
      : `₹${lpa(stats.p25)}–${lpa(stats.p75)} LPA`
    : null;
export const reports = (n: number) => `${n} ${n === 1 ? "report" : "reports"}`;

export function styleLine(metrics: CompanyMetrics) {
  const total = metrics.styleMix.reduce((sum, row) => sum + row.count, 0);
  const lead = [...metrics.styleMix].sort((a, b) => b.count - a.count)[0];
  const rounds = metrics.typicalRounds ? `~${metrics.typicalRounds} rounds` : null;
  const heavy =
    lead && total && lead.count / total >= 0.45 ? `${lead.family.toLowerCase()}-heavy` : null;
  return [rounds, heavy].filter(Boolean).join(", ") || null;
}

const symbols: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

/** Lakh/crore for INR, compact thousands for other currencies; never converted. */
export function money(amount: number, currency = "INR") {
  if (currency === "INR")
    return amount >= 10_000_000
      ? `₹${Math.round(amount / 100_000) / 100}Cr`
      : `₹${Math.round(amount / 10_000) / 10}L`;
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
  return symbols[currency] ? `${symbols[currency]}${compact}` : `${currency} ${compact}`;
}

/**
 * A representative grant without converting currencies: the median grant (by yearly value where
 * known) in the currency most reports use. Units-only grants are used when no grant has a value.
 */
export function typicalGrant(grants: EquityGrant[]): EquityGrant | undefined {
  const valued = grants.filter((grant) => grant.currency);
  const counts = new Map<string, number>();
  for (const grant of valued) counts.set(grant.currency!, (counts.get(grant.currency!) ?? 0) + 1);
  const currency = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const pool = currency
    ? valued
        .filter((grant) => grant.currency === currency)
        .sort((a, b) => (a.perYear ?? a.amount ?? 0) - (b.perYear ?? b.amount ?? 0))
    : [...grants].sort((a, b) => (a.units ?? 0) - (b.units ?? 0));
  return pool[Math.floor((pool.length - 1) / 2)];
}

const unitNoun = (type?: string) => (type === "RSU" ? "RSUs" : type === "ESOP" ? "ESOPs" : "units");

/** "$58K / 4 yrs", "₹3L / yr" for a yearly value, or "160 RSUs / 4 yrs" for a units-only grant. */
export function stockLabel(grant: EquityGrant, years = " / ") {
  const span = grant.vestingYears ? `${years}${grant.vestingYears} yrs` : "";
  if (grant.currency && grant.amount !== undefined)
    return `${money(grant.amount, grant.currency)}${span}`;
  if (grant.currency && grant.perYear !== undefined)
    return `${money(grant.perYear, grant.currency)} / yr`;
  return `${grant.units!.toLocaleString("en-IN")} ${unitNoun(grant.type)}${span}`;
}

/** Short extras line: variable, joining bonus, stock and benefits, only when reported. */
export function payExtras(metrics: CompanyMetrics) {
  const items: string[] = [];
  if (metrics.variablePercent.length) {
    const low = Math.min(...metrics.variablePercent);
    const high = Math.max(...metrics.variablePercent);
    items.push(`${low === high ? low : `${low}–${high}`}% variable`);
  } else if (metrics.variable) items.push(`${money(metrics.variable.median)} variable`);
  if (metrics.joiningBonus) items.push(`${money(metrics.joiningBonus.median)} joining`);
  const grant = typicalGrant(metrics.equity);
  if (grant)
    items.push(
      grant.currency ? stockLabel(grant).replace(/^(\S+)/, "$1 stock") : stockLabel(grant),
    );
  if (metrics.benefits.length)
    items.push(
      `${metrics.benefits.length} ${metrics.benefits.length === 1 ? "benefit" : "benefits"}`,
    );
  return items;
}

export const companyViews = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "compare", label: "Compare", icon: Rows3 },
  { id: "pipeline", label: "Pipeline", icon: Columns3 },
] as const;
export type CompanyView = (typeof companyViews)[number]["id"];
