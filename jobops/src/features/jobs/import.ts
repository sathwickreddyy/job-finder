import { z } from "zod";
import Papa from "papaparse";
export function normalizeJobUrl(input: string) {
  const u = new URL(input.trim());
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Use a public http(s) job URL without credentials.");
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (
      /^utm_/i.test(key) ||
      ["fbclid", "gclid", "trk", "trackingId", "ref", "refId"].includes(key)
    )
      u.searchParams.delete(key);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}
const normalizedPart = (v: string) => v.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
export function jobDedupeKey(input: { company: string; title: string; location: string }) {
  return JSON.stringify([input.company, input.title, input.location].map(normalizedPart));
}
const numeric = z.preprocess(
  (v) =>
    v === "" || v === null || v === undefined
      ? undefined
      : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())
        ? Number(v)
        : v,
  z.number().finite().nonnegative().optional(),
);
const date = z
  .string()
  .refine((v) => {
    const d = new Date(v);
    return (
      /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) &&
      !Number.isNaN(d.valueOf()) &&
      d.toISOString().slice(0, 10) === v.slice(0, 10)
    );
  }, "Use a valid ISO date (YYYY-MM-DD).")
  .optional();
export const jobInputSchema = z
  .object({
    company: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    location: z.string().trim().max(300).default(""),
    url: z
      .string()
      .trim()
      .max(2000)
      .refine((v) => {
        try {
          normalizeJobUrl(v);
          return true;
        } catch {
          return false;
        }
      }, "Use a valid http(s) job URL without credentials."),
    source: z.string().trim().min(1).max(100).default("MANUAL"),
    description: z.string().max(100000).default(""),
    notes: z.string().max(20000).default(""),
    workMode: z.enum(["UNKNOWN", "REMOTE", "HYBRID", "ONSITE"]).default("UNKNOWN"),
    employmentType: z.string().max(100).default("FULL_TIME"),
    externalId: z.string().max(200).optional(),
    experienceMin: numeric,
    experienceMax: numeric,
    salaryMin: numeric,
    salaryMax: numeric,
    currency: z.string().max(10).optional(),
    postedAt: date,
    requirements: z.array(z.string().max(2000)).max(100).default([]),
    keywords: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.experienceMin !== undefined &&
      v.experienceMax !== undefined &&
      v.experienceMax < v.experienceMin
    )
      ctx.addIssue({
        code: "custom",
        path: ["experienceMax"],
        message: "Maximum experience must be at least the minimum.",
      });
    if (v.salaryMin !== undefined && v.salaryMax !== undefined && v.salaryMax < v.salaryMin)
      ctx.addIssue({
        code: "custom",
        path: ["salaryMax"],
        message: "Maximum salary must be at least the minimum.",
      });
  });
export type JobInput = z.infer<typeof jobInputSchema> & { providedFields?: string[] };
export function resolveDuplicateId(matches: { id: string }[]) {
  const ids = [...new Set(matches.map((match) => match.id))];
  if (ids.length > 1)
    throw new Error(
      "Job identity conflict: this URL belongs to one job and company/title/location to another. Correct the conflicting row before import.",
    );
  return ids[0];
}
export type ImportRow = {
  row: number;
  data?: JobInput;
  errors: string[];
  duplicateOf?: number;
  existingId?: string;
};
export type ImportPreview = { rows: ImportRow[]; valid: boolean };
export function parseJobImport(text: string, format: "json" | "csv"): ImportPreview {
  if (text.length > 2_000_000)
    throw new Error("Import is limited to 2 MB. Split the file into smaller batches.");
  let records: unknown;
  if (format === "csv") {
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    if (parsed.errors.length)
      throw new Error(
        parsed.errors.map((e) => `CSV row ${(e.row ?? 0) + 1}: ${e.message}`).join("; "),
      );
    records = parsed.data.map((r) =>
      Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "")),
    );
  } else records = JSON.parse(text) as unknown;
  if (!Array.isArray(records) || records.length === 0)
    throw new Error("Paste a non-empty array of job records.");
  if (records.length > 500) throw new Error("Import at most 500 jobs in one batch.");
  const seen = new Map<string, number>();
  const rows: ImportRow[] = records.map((record, index) => {
    const parsed = jobInputSchema.safeParse(record);
    if (!parsed.success)
      return {
        row: index + 1,
        errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      };
    parsed.data.url = normalizeJobUrl(parsed.data.url);
    const keys = [parsed.data.url, jobDedupeKey(parsed.data)];
    const duplicateOf = keys.map((k) => seen.get(k)).find(Boolean);
    for (const key of keys) if (!seen.has(key)) seen.set(key, index + 1);
    return {
      row: index + 1,
      data: { ...parsed.data, providedFields: Object.keys(record) },
      errors: [],
      duplicateOf,
    };
  });
  return { rows, valid: rows.every((r) => r.errors.length === 0) };
}
