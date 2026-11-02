"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  ExternalLink,
  FileText,
  Minus,
  MoveVertical,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Change, FitOpening, Match, Requirement } from "./types";

export type Variant = "A" | "B" | "C";

/* ---------- shared pieces ---------- */

const TOOLS = [
  {
    id: "lexical",
    name: "Keyword check",
    by: "JobOps scoring service",
    method: "Reviewed job requirements found on the résumé, required terms weighted 3×.",
  },
  {
    id: "resumenext",
    name: "ResumeNext",
    by: "match_resume_to_job",
    method: "ResumeNext's own 100-point score: structure, content, contact and tailoring.",
  },
  {
    id: "optimizer",
    name: "ATS optimizer",
    by: "resume-ats-optimizer skill",
    method: "Required keywords found ÷ required keywords. The skill suggests 80% or more.",
  },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

function toolScore(o: FitOpening, tool: ToolId, side: "master" | "tailored") {
  const s = o[side];
  if (tool === "lexical") return s.lexical.weighted;
  if (tool === "resumenext") return s.resumenext.score;
  return s.atsOptimizer.match_score;
}

function istToday() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
function daysAgo(day: string) {
  return Math.round((Date.parse(istToday()) - Date.parse(day)) / 86_400_000);
}
function shortDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
function postedLine(o: FitOpening) {
  const age = daysAgo(o.postedAt);
  return `Posted ${shortDate(o.postedAt)}, ${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}`;
}
const fmt = (n: number | null) => (n == null ? "—" : Number.isInteger(n) ? `${n}` : n.toFixed(1));

function Delta({ from, to }: { from: number | null; to: number | null }) {
  if (from == null || to == null) return null;
  const d = Math.round((to - from) * 10) / 10;
  if (d === 0) return <span className="text-xs text-muted-foreground">no change</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        d > 0 ? "text-success" : "text-danger-action",
      )}
    >
      {d > 0 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
      {Math.abs(d)}
    </span>
  );
}

/** One 0–100 track: the filled bar is this file, the hollow tick is the master. */
function ScaleBar({
  master,
  tailored,
  target,
}: {
  master: number | null;
  tailored: number | null;
  target?: number;
}) {
  return (
    <div className="relative h-2 rounded-full bg-muted" aria-hidden>
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: `${tailored ?? 0}%` }}
      />
      {master != null && (
        <div
          className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full border-2 border-foreground/60 bg-card"
          style={{ left: `${master}%` }}
        />
      )}
      {target != null && (
        <div
          className="absolute -top-0.5 h-3 w-px bg-muted-foreground/70"
          style={{ left: `${target}%` }}
        />
      )}
    </div>
  );
}

const MATCH_LABEL: Record<Match, string> = {
  exact: "Exact match",
  alias: "Close match",
  missing: "Not on résumé",
};
function MatchBadge({ match }: { match: Match }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        match === "exact" && "bg-success-soft text-success",
        match === "alias" && "bg-warning-soft text-warning",
        match === "missing" && "border border-border text-muted-foreground",
      )}
    >
      {match === "exact" ? (
        <Check size={11} aria-hidden />
      ) : match === "alias" ? (
        <CircleDashed size={11} aria-hidden />
      ) : (
        <Minus size={11} aria-hidden />
      )}
      {MATCH_LABEL[match]}
    </span>
  );
}

function cleanEvidence(text: string) {
  return text.replace(/^(?:[A-Z][A-Z&]+\s){1,3}(?=[A-Z][a-z])/, "");
}
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const t = cleanEvidence(text);
  const re = new RegExp(
    `(${terms.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "ig",
  );
  const parts = t.split(re);
  return (
    <>
      {parts.map((p, i) =>
        terms.some((x) => x.toLowerCase() === p.toLowerCase()) ? (
          <mark key={i} className="rounded bg-selected px-0.5 text-selected-foreground">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function where(o: FitOpening, term: string) {
  const k = o.tailored.atsOptimizer.keywords.find((x) => x.term === term);
  if (!k || !k.found) return null;
  const places = (["summary", "skills", "experience"] as const).filter((p) => k.where[p] > 0);
  return { count: k.found, places };
}

function Evidence({ o, r }: { o: FitOpening; r: Requirement }) {
  const w = where(o, r.term);
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      <div>
        <p className="m-0 font-medium text-muted-foreground">The job asks</p>
        <p className="m-0 mt-1 text-foreground">“{r.jd_quote}”</p>
      </div>
      {r.tailored.match === "missing" ? (
        <p className="m-0 rounded-xl bg-muted p-2.5 text-muted-foreground">
          Not on this résumé. Left out on purpose: there is no experience to back it.
        </p>
      ) : (
        <div>
          <p className="m-0 font-medium text-muted-foreground">
            Your résumé says{w ? ` (${w.count}×, in ${w.places.join(", ")})` : ""}
          </p>
          {r.tailored.evidence.slice(0, 2).map((e, i) => (
            <p key={i} className="m-0 mt-1 line-clamp-3 text-foreground">
              <Highlight text={e} terms={[r.term, ...(r.aliases ?? [])]} />
            </p>
          ))}
        </div>
      )}
      {r.master.match === "missing" && r.tailored.match !== "missing" && (
        <p className="m-0 text-success">New in this version: the master did not mention it.</p>
      )}
    </div>
  );
}

/* ---------- 1. Matched job ---------- */

export function JobDemo({ v, o }: { v: Variant; o: FitOpening }) {
  const [open, setOpen] = useState(false);
  const jd = (
    <div className="mt-3 max-h-56 overflow-auto rounded-xl bg-muted p-3 text-xs leading-relaxed whitespace-pre-line text-foreground">
      {o.jdExcerpt}
      {o.jdLength > o.jdExcerpt.length && (
        <span className="text-muted-foreground">
          {" "}
          … {(o.jdLength - o.jdExcerpt.length).toLocaleString()} more characters saved
        </span>
      )}
    </div>
  );
  if (v === "A")
    return (
      <section className="rounded-2xl border border-border p-4">
        <p className="m-0 text-xs text-muted-foreground">Tailored for</p>
        <h3 className="m-0 mt-1 text-base font-semibold leading-snug">{o.title}</h3>
        <p className="m-0 mt-0.5 text-sm">{o.company}</p>
        <p className="m-0 mt-2 text-xs text-muted-foreground">
          {o.location}
          <br />
          {postedLine(o)}
          {o.postedAtKind === "latest_publication" ? " (latest publication)" : ""}
          {o.reqId ? `, req ${o.reqId}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={o.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Open job posting <ExternalLink size={12} aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => setOpen((x) => !x)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            aria-expanded={open}
          >
            <FileText size={12} aria-hidden /> {open ? "Hide" : "Read"} saved description
          </button>
        </div>
        {open && jd}
      </section>
    );
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-full bg-selected px-4 py-2.5 text-left text-selected-foreground"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {o.company} · {o.title}
          </span>
          <span className="block text-xs opacity-80">{postedLine(o)}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-1">
          {jd}
          <a
            href={o.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-link"
          >
            Open the live posting <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      )}
    </section>
  );
}

/* ---------- 2. Scores ---------- */

export function ScoresDemo({ v, o }: { v: Variant; o: FitOpening }) {
  const [tab, setTab] = useState<ToolId>("lexical");
  if (v === "A")
    return (
      <section>
        <h3 className="m-0 text-sm font-semibold">How well it fits</h3>
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          Bar: this file. Ring: your master résumé. Tool diagnostics, not an employer’s ATS.
        </p>
        <ul className="m-0 mt-4 list-none space-y-4 p-0">
          {TOOLS.map((t) => {
            const m = toolScore(o, t.id, "master");
            const s = toolScore(o, t.id, "tailored");
            return (
              <li key={t.id}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="flex-1 truncate text-[11px] text-muted-foreground">{t.by}</span>
                  <span className="text-lg font-semibold tabular-nums">{fmt(s)}</span>
                  <Delta from={m} to={s} />
                </div>
                <ScaleBar master={m} tailored={s} target={t.id === "optimizer" ? 80 : undefined} />
                <p className="m-0 mt-1.5 text-[11px] text-muted-foreground">
                  Master {fmt(m)}
                  {t.id === "resumenext" ? `, grade ${o.tailored.resumenext.grade}` : ""}
                  {t.id === "optimizer" ? ", suggested 80+" : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    );
  if (v === "B")
    return (
      <section>
        <h3 className="m-0 text-sm font-semibold">Scores against this job</h3>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-normal">Tool</th>
              <th className="pb-2 text-right font-normal">Master</th>
              <th className="pb-2 text-right font-normal">This file</th>
              <th className="w-12 pb-2 text-right font-normal" />
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((t) => {
              const m = toolScore(o, t.id, "master");
              const s = toolScore(o, t.id, "tailored");
              return (
                <tr key={t.id} className="border-t border-border" title={t.method}>
                  <td className="py-2.5">
                    <span className="block font-medium">{t.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.by}</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{fmt(m)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{fmt(s)}</td>
                  <td className="py-2.5 text-right">
                    <Delta from={m} to={s} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="m-0 mt-2 text-[11px] text-muted-foreground">
          Hover a tool for how it scores. Diagnostics, not an employer’s ATS.
        </p>
      </section>
    );
  const t = TOOLS.find((x) => x.id === tab)!;
  const m = toolScore(o, tab, "master");
  const s = toolScore(o, tab, "tailored");
  return (
    <section>
      <div role="tablist" className="flex gap-1 rounded-full bg-muted p-1">
        {TOOLS.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-xs font-medium",
              tab === x.id ? "bg-card shadow-surface" : "text-muted-foreground",
            )}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-3">
        <span className="text-4xl font-semibold leading-none tabular-nums">{fmt(s)}</span>
        <span className="pb-1 text-sm text-muted-foreground">from {fmt(m)} on the master</span>
        <span className="pb-1">
          <Delta from={m} to={s} />
        </span>
      </div>
      <p className="m-0 mt-2 text-xs text-muted-foreground">{t.method}</p>
      <div className="mt-4 space-y-2.5">
        {tab === "lexical" &&
          (["required", "preferred", "keyword"] as const).map((k) => (
            <Row
              key={k}
              label={k === "keyword" ? "All terms" : `${k[0].toUpperCase()}${k.slice(1)} terms`}
              m={o.master.lexical[k]}
              s={o.tailored.lexical[k]}
            />
          ))}
        {tab === "resumenext" &&
          o.tailored.resumenext.categories.map((c) => (
            <Row
              key={c.id}
              label={`${c.label} (${c.points}/${c.max})`}
              m={o.master.resumenext.categories.find((x) => x.id === c.id)?.percent ?? null}
              s={c.percent}
            />
          ))}
        {tab === "optimizer" && (
          <>
            <Row
              label="Required keywords"
              m={o.master.atsOptimizer.match_score}
              s={o.tailored.atsOptimizer.match_score}
              target={80}
            />
            <ul className="m-0 list-none space-y-1 p-0 pt-1">
              {o.tailored.atsOptimizer.format.map((f) => (
                <li key={f.check} className="flex items-start gap-2 text-xs">
                  {f.warn ? (
                    <CircleAlert size={14} className="mt-px shrink-0 text-warning" aria-hidden />
                  ) : f.ok ? (
                    <Check size={14} className="mt-px shrink-0 text-success" aria-hidden />
                  ) : (
                    <X size={14} className="mt-px shrink-0 text-danger-action" aria-hidden />
                  )}
                  <span>{f.check}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  m,
  s,
  target,
}: {
  label: string;
  m: number | null;
  s: number | null;
  target?: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums">
          <span className="text-muted-foreground">{fmt(m)} → </span>
          <span className="font-medium">{fmt(s)}</span>
        </span>
      </div>
      <ScaleBar master={m} tailored={s} target={target} />
    </div>
  );
}

/* ---------- 3. What matches ---------- */

export function KeywordsDemo({ v, o }: { v: Variant; o: FitOpening }) {
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const groups = (["required", "preferred"] as const).map((imp) => ({
    imp,
    items: o.requirements
      .filter((r) => r.importance === imp)
      .sort((a, b) => rank(a.tailored.match) - rank(b.tailored.match)),
  }));
  const matched = o.requirements.filter((r) => r.tailored.match !== "missing").length;
  const head = (
    <div className="flex items-baseline justify-between">
      <h3 className="m-0 text-sm font-semibold">What the job asks for</h3>
      <span className="text-xs text-muted-foreground">
        {matched} of {o.requirements.length} on your résumé
      </span>
    </div>
  );
  if (v === "A")
    return (
      <section>
        {head}
        {groups.map((g) =>
          g.items.length ? (
            <div key={g.imp} className="mt-4">
              <p className="m-0 mb-1 text-xs font-medium text-muted-foreground">
                {g.imp === "required" ? "Must have" : "Nice to have"}
              </p>
              <ul className="m-0 list-none divide-y divide-border p-0">
                {g.items.map((r) => {
                  const w = where(o, r.term);
                  const open = openTerm === r.term;
                  return (
                    <li key={r.term}>
                      <button
                        type="button"
                        onClick={() => setOpenTerm(open ? null : r.term)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-2 py-2.5 text-left"
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            r.tailored.match === "missing" && "text-muted-foreground",
                          )}
                        >
                          {r.term}
                        </span>
                        {w && (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {w.count}×
                          </span>
                        )}
                        <MatchBadge match={r.tailored.match} />
                      </button>
                      {open && (
                        <div className="pb-3">
                          <Evidence o={o} r={r} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null,
        )}
      </section>
    );
  const sel = o.requirements.find((r) => r.term === openTerm);
  return (
    <section>
      {head}
      {groups.map((g) =>
        g.items.length ? (
          <div key={g.imp} className="mt-4">
            <p className="m-0 mb-2 text-xs font-medium text-muted-foreground">
              {g.imp === "required" ? "Must have" : "Nice to have"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((r) => (
                <button
                  key={r.term}
                  type="button"
                  onClick={() => setOpenTerm(openTerm === r.term ? null : r.term)}
                  aria-pressed={openTerm === r.term}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium outline-offset-2",
                    r.tailored.match === "exact" && "bg-success-soft text-success",
                    r.tailored.match === "alias" && "bg-warning-soft text-warning",
                    r.tailored.match === "missing" &&
                      "border border-dashed border-border text-muted-foreground",
                    openTerm === r.term && "ring-2 ring-primary",
                  )}
                >
                  {r.master.match === "missing" && r.tailored.match !== "missing" && (
                    <Plus size={11} aria-label="new" />
                  )}
                  {r.term}
                </button>
              ))}
            </div>
          </div>
        ) : null,
      )}
      <div className="mt-4 rounded-2xl bg-muted p-3">
        {sel ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{sel.term}</span>
              <MatchBadge match={sel.tailored.match} />
            </div>
            <Evidence o={o} r={sel} />
          </>
        ) : (
          <p className="m-0 text-xs text-muted-foreground">
            Green is an exact match, amber a close one, dashed isn’t on the résumé. A plus marks
            terms this version added. Pick a term to see the job’s wording beside yours.
          </p>
        )}
      </div>
    </section>
  );
}
const rank = (m: Match) => (m === "missing" ? 2 : m === "alias" ? 1 : 0);

/* ---------- 4. What changed ---------- */

const KIND_LABEL: Record<Change["kind"], string> = {
  reworded: "Reworded",
  moved: "Moved",
  added: "Added",
  dropped: "Dropped",
};

export function ChangesDemo({ v, o }: { v: Variant; o: FitOpening }) {
  const [open, setOpen] = useState<number | null>(null);
  const counts = (["reworded", "moved", "added", "dropped"] as const)
    .map((k) => [k, o.changes.filter((c) => c.kind === k).length] as const)
    .filter(([, n]) => n);
  const summary = (
    <p className="m-0 mt-1 text-xs text-muted-foreground">
      From your master. {counts.map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}`).join(", ")}.
      Dates, titles and numbers unchanged.
    </p>
  );
  if (v === "A")
    return (
      <section>
        <h3 className="m-0 text-sm font-semibold">What changed</h3>
        {summary}
        <ul className="m-0 mt-3 list-none divide-y divide-border p-0">
          {o.changes
            .filter((c) => c.kind !== "moved")
            .map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="flex w-full items-center gap-2 py-2.5 text-left"
                >
                  <KindIcon kind={c.kind} />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.where}</span>
                  <span className="text-[11px] text-muted-foreground">{KIND_LABEL[c.kind]}</span>
                </button>
                {open === i && <BeforeAfter c={c} />}
              </li>
            ))}
        </ul>
        {o.changes.some((c) => c.kind === "moved") && (
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            {o.changes.filter((c) => c.kind === "moved").length} bullets moved up or down to lead
            with what this job asks for.
          </p>
        )}
      </section>
    );
  const sections = [...new Set(o.changes.map((c) => c.where.split(" · ")[0]))];
  return (
    <section>
      <h3 className="m-0 text-sm font-semibold">Tracked changes</h3>
      {summary}
      <div className="mt-3 space-y-4">
        {sections.map((s) => (
          <div key={s}>
            <p className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">{s}</p>
            <div className="space-y-2">
              {o.changes
                .filter((c) => c.where.split(" · ")[0] === s)
                .map((c, i) => (
                  <p key={i} className="m-0 text-xs leading-relaxed">
                    {c.kind === "moved" ? (
                      <span className="text-muted-foreground">
                        <MoveVertical size={11} className="mr-1 inline" aria-hidden />
                        Line {c.from} → {c.to}: {c.after?.slice(0, 70)}…
                      </span>
                    ) : (
                      <InlineDiff before={c.before} after={c.after} />
                    )}
                  </p>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KindIcon({ kind }: { kind: Change["kind"] }) {
  const cls = "shrink-0";
  if (kind === "added") return <Plus size={14} className={cn(cls, "text-success")} aria-hidden />;
  if (kind === "dropped")
    return <Minus size={14} className={cn(cls, "text-danger-action")} aria-hidden />;
  if (kind === "moved")
    return <MoveVertical size={14} className={cn(cls, "text-muted-foreground")} aria-hidden />;
  return <CircleDashed size={14} className={cn(cls, "text-link")} aria-hidden />;
}

function BeforeAfter({ c }: { c: Change }) {
  return (
    <div className="space-y-2 pb-3 text-xs leading-relaxed">
      {c.before && (
        <p className="m-0 rounded-xl bg-danger-soft/60 p-2.5">
          <span className="font-medium">Before: </span>
          {c.before}
        </p>
      )}
      {c.after && (
        <p className="m-0 rounded-xl bg-success-soft/70 p-2.5">
          <span className="font-medium">Now: </span>
          {c.after}
        </p>
      )}
    </div>
  );
}

/** Word-level diff so a rewording reads like tracked changes. */
function InlineDiff({ before, after }: { before: string | null; after: string | null }) {
  if (!before) return <span className="bg-success-soft text-success">{after}</span>;
  if (!after) return <del className="text-danger-action">{before}</del>;
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: ReactNode[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(<span key={`${i}-${j}`}>{a[i]}</span>);
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j]))
      out.push(
        <ins key={`b${j}`} className="bg-success-soft text-success no-underline">
          {b[j++]}
        </ins>,
      );
    else
      out.push(
        <del key={`a${i}`} className="text-danger-action">
          {a[i++]}
        </del>,
      );
  }
  return <>{out}</>;
}

/* ---------- 5. Advice ---------- */

const NOT_FIXING: Record<string, string> = {
  "Job description keywords":
    "Its list is generic words from the posting (company boilerplate, links, req numbers). Adding them wouldn’t be honest or useful.",
  "Work experience":
    "It reads wrapped bullet lines as separate jobs. Your three roles all have dates and bullets.",
  "Action verbs":
    "Current-role bullets stay in present tense (Lead, Build), as you chose on 3 Oct. Say if you want past tense.",
};

export function AdviceDemo({ v, o }: { v: Variant; o: FitOpening }) {
  const issues = o.tailored.resumenext.issues.filter((x) => !x.label.startsWith("Experience —"));
  const phantom = o.tailored.resumenext.issues.length - issues.length;
  const fmtChecks = o.tailored.atsOptimizer.format;
  if (v === "A")
    return (
      <section>
        <h3 className="m-0 text-sm font-semibold">What the tools suggest</h3>
        <ul className="m-0 mt-3 list-none space-y-3 p-0">
          {issues.map((x) => (
            <li key={x.label} className="flex gap-2.5">
              <Severity s={x.severity} />
              <div className="min-w-0 text-xs leading-relaxed">
                <p className="m-0 text-sm font-medium">{x.label}</p>
                <p className="m-0 text-muted-foreground">{x.hint}</p>
                {NOT_FIXING[x.label] && (
                  <p className="m-0 mt-1 rounded-lg bg-muted px-2 py-1">
                    Not changing: {NOT_FIXING[x.label]}
                  </p>
                )}
              </div>
            </li>
          ))}
          {phantom > 0 && (
            <li className="flex gap-2.5 text-xs text-muted-foreground">
              <Severity s="optional" />
              {phantom} “missing company or date” notes come from wrapped lines read as extra jobs.
              Not changing.
            </li>
          )}
          {fmtChecks
            .filter((f) => f.warn || !f.ok)
            .map((f) => (
              <li key={f.check} className="flex gap-2.5 text-xs leading-relaxed">
                <Severity s="optional" />
                <div>
                  <p className="m-0 text-sm font-medium">{f.check}</p>
                  <p className="m-0 text-muted-foreground">{f.detail}</p>
                </div>
              </li>
            ))}
        </ul>
      </section>
    );
  return (
    <section className="space-y-4">
      <h3 className="m-0 text-sm font-semibold">Checks by tool</h3>
      <div>
        <p className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">
          ATS optimizer: formatting
        </p>
        <ul className="m-0 list-none space-y-1 p-0">
          {fmtChecks.map((f) => (
            <li key={f.check} className="flex items-start gap-2 text-xs" title={f.detail}>
              {f.warn ? (
                <CircleAlert size={14} className="mt-px shrink-0 text-warning" aria-hidden />
              ) : f.ok ? (
                <Check size={14} className="mt-px shrink-0 text-success" aria-hidden />
              ) : (
                <X size={14} className="mt-px shrink-0 text-danger-action" aria-hidden />
              )}
              {f.check}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">ResumeNext: issues</p>
        <ul className="m-0 list-none space-y-1.5 p-0">
          {o.tailored.resumenext.issues.map((x, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <Severity s={x.severity} />
              <span className={cn(x.label.startsWith("Experience —") && "text-muted-foreground")}>
                {x.label.startsWith("Experience —") ? "Parser note on a wrapped line" : x.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">
          Keyword check: not evidenced
        </p>
        <p className="m-0 text-xs">{o.tailored.lexicalMissing.join(", ") || "Nothing"}</p>
      </div>
    </section>
  );
}

function Severity({ s }: { s: "urgent" | "important" | "optional" }) {
  return (
    <span
      className={cn(
        "mt-1 size-2 shrink-0 rounded-full",
        s === "urgent" && "bg-danger-action",
        s === "important" && "bg-warning",
        s === "optional" && "bg-muted-foreground/50",
      )}
      aria-label={s}
    />
  );
}

/* ---------- 6. Panel layout ---------- */

export function PanelDemo({
  v,
  o,
  picks,
}: {
  v: Variant;
  o: FitOpening;
  picks: Record<string, Variant>;
}) {
  const [tab, setTab] = useState<"fit" | "changes" | "used">("fit");
  const fit = (
    <div className="space-y-6">
      <ScoresDemo v={picks.scores} o={o} />
      <KeywordsDemo v={picks.keywords} o={o} />
      <AdviceDemo v={picks.advice} o={o} />
    </div>
  );
  const used = (
    <div className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">
      Not sent anywhere yet. Applications record the exact PDF they used.
    </div>
  );
  if (v === "A")
    return (
      <div className="space-y-5">
        <JobDemo v={picks.job} o={o} />
        <div role="tablist" className="flex gap-1 border-b border-border">
          {(
            [
              ["fit", "Fit"],
              ["changes", `Changes (${o.changes.length})`],
              ["used", "Used for"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                tab === id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "fit" ? fit : tab === "changes" ? <ChangesDemo v={picks.changes} o={o} /> : used}
      </div>
    );
  return (
    <div className="space-y-6">
      <JobDemo v={picks.job} o={o} />
      {fit}
      <details className="group border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex-1">What changed</span>
          <span className="mr-2 text-xs font-normal text-muted-foreground">
            {o.changes.length} edits
          </span>
          <ChevronDown
            size={16}
            className="text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="pt-3">
          <ChangesDemo v={picks.changes} o={o} />
        </div>
      </details>
      <details className="group border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Used for</span>
          <span className="mr-2 text-xs font-normal text-muted-foreground">0 sent</span>
          <ChevronDown
            size={16}
            className="text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="pt-3">{used}</div>
      </details>
    </div>
  );
}
