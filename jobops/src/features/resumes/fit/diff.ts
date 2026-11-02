// Tracked changes between two extracted résumé texts, for display only (not a score).
export type Change = {
  kind: "reworded" | "moved" | "added" | "dropped";
  where: string;
  before: string | null;
  after: string | null;
  from?: number;
  to?: number;
};

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE = `(?:(?:${MONTHS}) \\d{4}|\\d{4})`;
const datedLine = new RegExp(`\\s+${DATE}\\s*[–-]\\s*(?:Present|${DATE})$`);
const placedLine = /\s+[A-Z][a-z]+, [A-Z][a-z]+$/;
// Employer and role lines end with a date range or a "City, Country" location.
const isHeader = (line: string) =>
  !line.startsWith("•") && (datedLine.test(line) || placedLine.test(line));
// All-caps ruled headings; a wrapped line such as "AWS." has a period and is not one.
const headingLine = /^[A-Z][A-Z&/ ]{3,}[A-Z]$/;
// The PDF extractor's page footer ("-- 1 of 2 --") is not résumé content.
const pageMarker = /^--\s*\d+\s+of\s+\d+\s*--$/;
const contentLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !pageMarker.test(l));
const skillRow = /^[A-Z][\w &/+.-]*:/;

function sectionName(heading: string) {
  if (heading.includes("SUMMARY")) return "Summary";
  if (heading.includes("SKILLS")) return "Skills";
  const lower = heading.toLowerCase();
  return lower[0].toUpperCase() + lower.slice(1);
}

export function splitSections(text: string): { name: string; units: string[] }[] {
  const lines = contentLines(text);
  const sections: { name: string; units: string[] }[] = [];
  if (lines[1]) sections.push({ name: "Title line", units: [lines[1]] });
  let current: { name: string; units: string[] } | null = null;
  let experience = false;
  let open = false; // whether the last unit can take a wrapped continuation line
  let inHeader = false; // inside an employer block's run of employer/role lines
  for (const line of lines.slice(2)) {
    if (headingLine.test(line)) {
      experience = line.includes("EXPERIENCE");
      current = experience ? null : { name: sectionName(line), units: [] };
      if (current) sections.push(current);
      open = inHeader = false;
      continue;
    }
    if (experience && isHeader(line)) {
      // The first line of a run names the employer; later lines are roles, kept as units.
      if (!inHeader) {
        current = { name: line.replace(datedLine, "").replace(placedLine, ""), units: [] };
        sections.push(current);
      } else current?.units.push(line);
      inHeader = true;
      open = false;
      continue;
    }
    inHeader = false;
    if (!current) continue; // contact lines before the first heading
    const starts = line.startsWith("•") || (current.name === "Skills" && skillRow.test(line));
    if (open && !starts) {
      const last = current.units.length - 1;
      const prev = current.units[last];
      current.units[last] = prev.endsWith("-") ? prev + line : `${prev} ${line}`;
    } else current.units.push(line);
    open = true;
  }
  return sections;
}

const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
function dice(a: string, b: string) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size && !y.size) return 1;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return (2 * shared) / (x.size + y.size);
}

// Indices (into pairs sorted by `to`) of a longest run whose `from` also increases; the rest moved.
function stayedInOrder(froms: number[]) {
  const len = froms.map(() => 1);
  const prev = froms.map(() => -1);
  for (let i = 0; i < froms.length; i++)
    for (let j = 0; j < i; j++)
      if (froms[j] < froms[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
  const kept = new Set<number>();
  let k = len.indexOf(Math.max(0, ...len));
  while (k >= 0) {
    kept.add(k);
    k = prev[k];
  }
  return kept;
}

function diffUnits(where: string, a: string[], b: string[]): Change[] {
  const candidates: { i: number; j: number; score: number }[] = [];
  a.forEach((x, i) =>
    b.forEach((y, j) => {
      const score = x === y ? 2 : dice(x, y);
      if (score >= 0.6) candidates.push({ i, j, score });
    }),
  );
  candidates.sort((p, q) => q.score - p.score || Math.abs(p.i - p.j) - Math.abs(q.i - q.j));
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: { i: number; j: number }[] = [];
  for (const c of candidates) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue;
    usedA.add(c.i);
    usedB.add(c.j);
    pairs.push(c);
  }
  pairs.sort((p, q) => p.j - q.j);
  const kept = stayedInOrder(pairs.map((p) => p.i));
  const changes: { at: number; change: Change }[] = [];
  pairs.forEach((p, k) => {
    const before = a[p.i];
    const after = b[p.j];
    if (!kept.has(k))
      changes.push({
        at: p.j,
        change: { kind: "moved", where, before, after, from: p.i + 1, to: p.j + 1 },
      });
    else if (before !== after)
      changes.push({ at: p.j, change: { kind: "reworded", where, before, after } });
  });
  b.forEach((after, j) => {
    if (!usedB.has(j))
      changes.push({ at: j, change: { kind: "added", where, before: null, after } });
  });
  a.forEach((before, i) => {
    if (!usedA.has(i))
      changes.push({ at: i + 0.5, change: { kind: "dropped", where, before, after: null } });
  });
  return changes.sort((x, y) => x.at - y.at).map((c) => c.change);
}

const factPattern = new RegExp(`\\d[\\d.,%$+]*|\\b(?:${MONTHS})\\b`, "g");
const facts = (text: string) =>
  (contentLines(text).join("\n").match(factPattern) ?? [])
    .map((f) => f.replace(/[.,]+$/, ""))
    .sort();

// Multiset difference: each fact in `a` not matched one-for-one in `b`.
function without(a: string[], b: string[]) {
  const left = [...b];
  return a.filter((f) => {
    const i = left.indexOf(f);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

export function diffResumes(base: string, mine: string) {
  const before = splitSections(base);
  const after = splitSections(mine);
  const names = [...after.map((s) => s.name), ...before.map((s) => s.name)].filter(
    (name, i, all) => all.indexOf(name) === i,
  );
  const sections = names
    .map((name) => ({
      name,
      changes: diffUnits(
        name,
        before.find((s) => s.name === name)?.units ?? [],
        after.find((s) => s.name === name)?.units ?? [],
      ),
    }))
    .filter((s) => s.changes.length);
  const counts: Record<Change["kind"], number> = { reworded: 0, moved: 0, added: 0, dropped: 0 };
  for (const s of sections) for (const c of s.changes) counts[c.kind]++;
  const factChanges = {
    removed: without(facts(base), facts(mine)),
    added: without(facts(mine), facts(base)),
  };
  const factsUnchanged = !factChanges.removed.length && !factChanges.added.length;
  return { sections, counts, factsUnchanged, factChanges };
}

/** Word-level LCS so a rewording reads like tracked changes. */
export function wordDiff(before: string, after: string) {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { op: "same" | "ins" | "del"; text: string }[] = [];
  const push = (op: "same" | "ins" | "del", text: string) => {
    const last = out[out.length - 1];
    if (last?.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || dp[i + 1][j] >= dp[i][j + 1])) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  return out.filter((part) => part.text);
}
