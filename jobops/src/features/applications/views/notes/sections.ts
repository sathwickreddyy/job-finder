export type NoteSections = {
  summary: string | null;
  onTheForm: string | null;
  proof: string | null;
  /** Everything outside the three template sections, in order. */
  rest: string;
};

const HEADINGS: Record<string, "summary" | "onTheForm" | "proof"> = {
  summary: "summary",
  "on the form": "onTheForm",
  proof: "proof",
};

/**
 * Splits a note written from the template (`## Summary`, `## On the form`, `## Proof`).
 * Returns null when none of the three headings is present, so free Markdown is left alone.
 * Headings inside code fences do not count; any other heading closes the current section.
 */
export function parseNoteSections(markdown: string): NoteSections | null {
  const buckets: Record<"summary" | "onTheForm" | "proof" | "rest", string[]> = {
    summary: [],
    onTheForm: [],
    proof: [],
    rest: [],
  };
  const found = new Set<string>();
  let current: keyof typeof buckets = "rest";
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMark = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (fenceMark) {
      if (fence === null) fence = fenceMark[0];
      else if (fenceMark[0] === fence) fence = null;
    } else if (fence === null) {
      const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) {
        const key = /^##\s/.test(line) ? HEADINGS[heading[1].toLowerCase()] : undefined;
        current = key ?? "rest";
        if (key) {
          found.add(key);
          continue;
        }
      }
    }
    buckets[current].push(line);
  }
  if (!found.size) return null;
  const text = (key: keyof typeof buckets) => buckets[key].join("\n").trim();
  return {
    summary: found.has("summary") ? text("summary") : null,
    onTheForm: found.has("onTheForm") ? text("onTheForm") : null,
    proof: found.has("proof") ? text("proof") : null,
    rest: text("rest"),
  };
}
