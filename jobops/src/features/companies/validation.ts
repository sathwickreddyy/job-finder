import { z } from "zod";
import { companyCategories, companySourceKinds, companyVerificationStatuses } from "@/db/schema";
import { interviewOutcomes, roundKinds } from "./metrics";

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
const positive = z.number().finite().positive();
const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Use an uppercase ISO 4217 currency code such as INR.");
/**
 * A stock grant, usually in dollars or units while cash pay is INR: the total grant (`amount`), the
 * yearly value (`annualAmount`) or the number of units, in any combination. Values keep their own
 * currency and are never converted.
 */
export const equitySchema = z
  .object({
    amount: positive.optional(),
    annualAmount: positive.optional(),
    units: z.number().int().positive().optional(),
    currency: currencyCode.optional(),
    vestingYears: z.number().positive().max(10).optional(),
    type: z.enum(["RSU", "ESOP", "STOCK_BONUS", "OTHER"]).optional(),
  })
  .passthrough()
  .superRefine((grant, context) => {
    const valued = grant.amount !== undefined || grant.annualAmount !== undefined;
    if (!valued && grant.units === undefined)
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Supply the total grant as amount, the yearly value as annualAmount, or units.",
      });
    if (valued && grant.currency === undefined)
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "A stock value needs its own currency code, e.g. USD.",
      });
  });
/** Original text amounts and the numeric fields that must accompany them. */
export const compensationTwins = [
  ["fixedAnnualOriginal", ["fixedAnnual"]],
  ["totalAnnualOriginal", ["totalAnnual"]],
  ["joiningBonusOriginal", ["joiningBonus"]],
  ["variableOriginal", ["variableAnnual", "variablePercent"]],
  ["equityOriginal", ["equity"]],
] as const;
const interviewRound = z
  .object({
    name: text().min(1),
    kind: z.enum(roundKinds),
    summary: text(10000).optional(),
    durationMinutes: amount,
    topics: words,
    questions,
    referenceUrl: httpUrl.optional(),
  })
  .passthrough();
export const factDataSchemas = {
  COMPENSATION: z
    .object({
      ...publicationFields,
      role: text().min(1),
      level: text().optional(),
      yearsExperience: amount,
      currency: currencyCode,
      fixedAnnual: positive.optional(),
      totalAnnual: positive.optional(),
      // Zero records a report that explicitly says there is none.
      variableAnnual: z.number().finite().nonnegative().optional(),
      variablePercent: z.number().min(0).max(100).optional(),
      joiningBonus: z.number().finite().nonnegative().optional(),
      equity: equitySchema.optional(),
      benefits: z.array(text(300).min(1)).max(50).optional(),
      vestingNotes: text(10000).optional(),
      offerDate: date.optional(),
      officeDaysPerWeek: z.number().int().min(0).max(7).optional(),
    })
    .passthrough()
    .superRefine(
      (value, context) => {
        if (!value || typeof value !== "object") return;
        const data = value as Record<string, unknown>;
        if (data.fixedAnnual === undefined && data.totalAnnual === undefined)
          context.addIssue({
            code: "custom",
            path: ["fixedAnnual"],
            message:
              "Supply fixedAnnual or totalAnnual as a number in whole currency units per year, e.g. 3100000 for 31 LPA.",
          });
        for (const [original, numeric] of compensationTwins)
          // A null original was cleared after review (its text moved to notes), so it needs no twin.
          if (data[original] != null && numeric.every((key) => data[key] === undefined))
            context.addIssue({
              code: "custom",
              path: [numeric[0]],
              message: `${original} needs its numeric twin ${numeric.join(" or ")}.`,
            });
      },
      // Report the missing amount together with other field errors, so writers fix everything at once.
      { when: () => true },
    ),
  INTERVIEW: z
    .object({
      ...publicationFields,
      role: text().min(1),
      level: text().optional(),
      yearsExperience: amount,
      outcome: z.enum(interviewOutcomes),
      outcomeNotes: text(10000).optional(),
      roundCount: z.number().int().positive(),
      rounds: z.array(interviewRound).min(1).max(100),
      topics: words,
      questions,
      applicationRoute: text().optional(),
    })
    .passthrough()
    .refine((value) => value.roundCount >= value.rounds.length, {
      path: ["roundCount"],
      message: "roundCount cannot be less than the number of described rounds.",
    }),
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
  const parsed = factDataSchemas[value.category].safeParse(value.data ?? {});
  if (!parsed.success)
    throw new z.ZodError(
      parsed.error.issues.map((issue) => ({ ...issue, path: ["data", ...issue.path] })),
    );
  const data = parsed.data as Record<string, unknown>;
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
