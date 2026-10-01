import { z } from "zod";
import { companyCategories, companySourceKinds, companyVerificationStatuses } from "@/db/schema";

export function normalizeIdentity(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
export function normalizeCity(value: string) {
  const city = normalizeIdentity(value);
  return city === "bangalore" || city === "bengaluru"
    ? "Bengaluru"
    : city === "hyderabad"
      ? "Hyderabad"
      : value.trim().replace(/\s+/g, " ");
}
export function locationIdentity(place: { city: string; state?: string; country?: string }) {
  return JSON.stringify([
    normalizeIdentity(normalizeCity(place.city)),
    normalizeIdentity(place.state ?? ""),
    normalizeIdentity(place.country ?? "India"),
  ]);
}
export function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  return names
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name) => {
      const key = normalizeIdentity(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
const text = (max = 500) => z.string().trim().max(max);
const httpUrl = z
  .string()
  .trim()
  .max(4096)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }, "Use an HTTP(S) URL without credentials.")
  .transform((value) => new URL(value).toString());
const date = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const amount = z.number().finite().nonnegative().optional();
const words = z.array(text()).max(500).optional();
const publicationFields = {
  publicationYear: z.number().int().min(1900).max(9999).optional(),
  publishedAt: date.optional(),
};
const questions = z
  .array(
    z.union([
      text(10000).min(1),
      z
        .object({
          text: text(10000).min(1),
          referenceUrl: httpUrl.optional(),
          topic: text().optional(),
          round: text().optional(),
        })
        .passthrough(),
    ]),
  )
  .max(500)
  .optional();
const roleFields = {
  ...publicationFields,
  role: text().optional(),
  title: text().optional(),
  level: text().optional(),
  employmentType: text().optional(),
  minExperience: amount,
  maxExperience: amount,
  skills: words,
  status: text().optional(),
  openingUrl: httpUrl.optional(),
};
export const factDataSchemas = {
  COMPENSATION: z
    .object({
      ...publicationFields,
      role: text().optional(),
      level: text().optional(),
      yearsExperience: amount,
      currency: text(12).optional(),
      fixedAnnual: amount,
      variableAnnual: amount,
      joiningBonus: amount,
      equity: amount,
      totalAnnual: amount,
      vestingNotes: text(10000).optional(),
      offerDate: date.optional(),
      officeDaysPerWeek: z.number().int().min(0).max(7).optional(),
    })
    .passthrough(),
  INTERVIEW: z
    .object({
      ...publicationFields,
      role: text().optional(),
      level: text().optional(),
      outcome: text().optional(),
      roundCount: z.number().int().nonnegative().optional(),
      rounds: z
        .array(
          z.union([
            text(10000),
            z
              .object({
                name: text().optional(),
                summary: text(10000).optional(),
                durationMinutes: amount,
                topics: words,
                questions,
                referenceUrl: httpUrl.optional(),
              })
              .passthrough(),
          ]),
        )
        .max(100)
        .optional(),
      topics: words,
      questions,
      applicationRoute: text().optional(),
    })
    .passthrough(),
  TECH_STACK: z
    .object({
      ...publicationFields,
      languages: words,
      frameworks: words,
      platforms: words,
      infrastructure: words,
      team: text().optional(),
      domain: text().optional(),
    })
    .passthrough(),
  ROLE: z
    .object(roleFields)
    .passthrough()
    .refine(
      (value) =>
        value.minExperience === undefined ||
        value.maxExperience === undefined ||
        value.minExperience <= value.maxExperience,
      "Minimum experience cannot exceed maximum experience.",
    ),
  HIRING_SIGNAL: z
    .object(roleFields)
    .passthrough()
    .refine(
      (value) =>
        value.minExperience === undefined ||
        value.maxExperience === undefined ||
        value.minExperience <= value.maxExperience,
      "Minimum experience cannot exceed maximum experience.",
    ),
  WORK_MODE: z
    .object({
      ...publicationFields,
      city: text().optional(),
      mode: z.enum(["ONSITE", "HYBRID", "REMOTE", "UNKNOWN"]).optional(),
      officeDaysPerWeek: z.number().int().min(0).max(7).optional(),
      effectiveDate: date.optional(),
    })
    .passthrough(),
  REFERRAL: z
    .object({
      ...publicationFields,
      route: text().optional(),
      contactContext: text(10000).optional(),
      responseNotes: text(10000).optional(),
      conversionNotes: text(10000).optional(),
      instructions: text(20000).optional(),
    })
    .passthrough(),
  CULTURE: z.object(publicationFields).passthrough(),
  OTHER: z.object(publicationFields).passthrough(),
} satisfies Record<(typeof companyCategories)[number], z.ZodType>;
const jsonObject = z
  .unknown()
  .superRefine((value, context) => {
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    while (pending.length) {
      const item = pending.pop()!;
      if (item.depth > 20) {
        context.addIssue({
          code: "custom",
          message: "Fact data supports at most 20 nested levels.",
        });
        return;
      }
      if (item.value && typeof item.value === "object") {
        for (const [key, child] of Object.entries(item.value)) {
          if (["__proto__", "constructor", "prototype"].includes(key)) {
            context.addIssue({ code: "custom", message: "Unsafe object key in fact data." });
            return;
          }
          pending.push({ value: child, depth: item.depth + 1 });
        }
      }
    }
  })
  .pipe(z.record(z.string(), z.json()));
export const factPatchSchema = z
  .object({
    factKey: text(200).min(1),
    category: z.enum(companyCategories).optional(),
    title: text(1000).min(1).optional(),
    summary: text(20000).optional(),
    data: jsonObject.optional(),
    sourceUrl: httpUrl.optional(),
    sourceTitle: text(2000).optional(),
    sourceKind: z.enum(companySourceKinds).optional(),
    verificationStatus: z.enum(companyVerificationStatuses).optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    occurredAt: date.nullable().optional(),
  })
  .strict();
export const fullFactSchema = factPatchSchema.extend({
  category: z.enum(companyCategories),
  title: text(1000).min(1),
  sourceUrl: httpUrl,
});
export type FactInput = z.infer<typeof factPatchSchema>;
export function sourceClassification(url: string, kind?: (typeof companySourceKinds)[number]) {
  const host = new URL(url).hostname.toLowerCase();
  return host === "leetcode.com" || host.endsWith(".leetcode.com") ? "LEETCODE" : (kind ?? "OTHER");
}
export function validateFact(input: unknown) {
  const value = fullFactSchema.parse(input);
  const sourceKind = sourceClassification(value.sourceUrl, value.sourceKind);
  const community = sourceKind === "LEETCODE" || sourceKind === "COMMUNITY";
  if (community && value.verificationStatus === "VERIFIED")
    throw new z.ZodError([
      {
        code: "custom",
        path: ["verificationStatus"],
        message: "Community evidence cannot be labelled VERIFIED.",
      },
    ]);
  const data = factDataSchemas[value.category].parse(value.data ?? {}) as Record<string, unknown>;
  if (
    data.publicationYear !== undefined &&
    typeof data.publishedAt === "string" &&
    data.publicationYear !== Number(data.publishedAt.slice(0, 4))
  )
    throw new z.ZodError([
      {
        code: "custom",
        path: ["data", "publicationYear"],
        message: "Publication year must match the source publication date.",
      },
    ]);
  return {
    ...value,
    data,
    sourceKind,
    verificationStatus:
      value.verificationStatus ??
      (community ? "COMMUNITY_REPORTED" : sourceKind === "OFFICIAL" ? "VERIFIED" : "UNVERIFIED"),
  };
}
export const locationSchema = z
  .object({
    city: text(200).min(1).transform(normalizeCity),
    state: text(200).optional(),
    country: text(200).min(1).optional(),
    workModes: z
      .array(z.enum(["ONSITE", "HYBRID", "REMOTE", "UNKNOWN"]))
      .max(4)
      .optional(),
    isPrimary: z.boolean().optional(),
    sourceUrl: httpUrl.nullable().optional(),
    verificationStatus: z.enum(companyVerificationStatuses).optional(),
  })
  .strict();
const fields = {
  name: text(300).min(1).optional(),
  aliases: z.array(text(300).min(1)).max(100).optional(),
  replaceAliases: z.boolean().optional(),
  focus: text(5000).optional(),
  websiteUrl: httpUrl.nullable().optional(),
  careersUrl: httpUrl.nullable().optional(),
  portalNote: text(10000).optional(),
  archive: z.boolean().optional(),
  locations: z.array(locationSchema).max(200).optional(),
  facts: z.array(factPatchSchema).max(1000).optional(),
};
export const companyPatchSchema = z
  .object(fields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Supply at least one update.")
  .refine(
    (value) => !value.replaceAliases || value.aliases !== undefined,
    "replaceAliases requires aliases.",
  );
export const companyInputSchema = z
  .object({
    ...fields,
    slug: text(150)
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .refine(
        (value) => !["schema", "batch"].includes(value) && !z.uuid().safeParse(value).success,
        "Use a company slug other than the reserved route names or a UUID.",
      ),
    name: text(300).min(1),
  })
  .strict()
  .refine(
    (value) => !value.replaceAliases || value.aliases !== undefined,
    "replaceAliases requires aliases.",
  );
export const companyBatchSchema = z
  .object({ companies: z.array(companyInputSchema).min(1).max(100) })
  .strict();
export const companyFilterSchema = z
  .object({
    city: text(200).optional(),
    status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).optional(),
    q: text(300).optional(),
    updatedAfter: date.optional(),
    include: z
      .string()
      .refine(
        (value) => value.split(",").every((part) => ["facts", "locations"].includes(part)),
        "include supports facts,locations.",
      )
      .optional(),
  })
  .strict();
export type CompanyInput = z.infer<typeof companyInputSchema>;
export type CompanyPatch = z.infer<typeof companyPatchSchema>;
export type CompanyFilters = z.infer<typeof companyFilterSchema>;
export function mergeData(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    const previous = result[key];
    result[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      previous &&
      typeof previous === "object" &&
      !Array.isArray(previous)
        ? mergeData(previous as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return result;
}
