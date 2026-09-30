import { z } from "zod";

export const UNKNOWN = "UNKNOWN";
export const remotePreferences = ["UNKNOWN", "REMOTE", "HYBRID", "HYBRID_OR_REMOTE", "ONSITE", "ANY"] as const;
export function explicitAnswer(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : UNKNOWN;
}
export const standardAnswersSchema = z.record(z.string().trim().min(1).max(300), z.string().max(4000)).transform((answers) => Object.fromEntries(Object.entries(answers).map(([question, answer]) => [question, explicitAnswer(answer)])));
const optionalText = z.string().trim().max(2000).transform((value) => value || null);
const optionalUrl = z.string().trim().refine((value) => !value || /^https?:\/\//i.test(value), "Use a full http:// or https:// URL").refine((value) => { try { return !value || Boolean(new URL(value)); } catch { return false; } }, "Enter a valid URL").transform((value) => value || null);
export const candidateSchema = z.object({
  fullName: optionalText, preferredName: optionalText, primaryEmail: z.string().trim().refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email").transform((v) => v || null), phone: optionalText,
  currentCity: optionalText, country: optionalText, yearsOfExperience: z.union([z.literal(""), z.coerce.number().min(0).max(80)]).transform((v) => v === "" ? null : v), currentCompany: optionalText, currentRole: optionalText,
  currentCompensation: optionalText, expectedCompensation: optionalText, noticePeriod: optionalText, lastWorkingDay: z.string().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "Enter a valid date").transform((v) => v ? new Date(`${v}T00:00:00Z`) : null),
  preferredLocations: z.array(z.string().max(100)).max(50), desiredRoles: z.array(z.string().max(150)).max(50), remotePreference: z.enum(remotePreferences),
  linkedinUrl: optionalUrl, githubUrl: optionalUrl, portfolioUrl: optionalUrl, careerSummary: z.string().max(15000).transform((v) => v || null),
  workAuthorization: z.string().max(2000).transform(explicitAnswer), sponsorship: z.string().max(2000).transform(explicitAnswer), relocationPreference: z.string().max(2000).transform(explicitAnswer),
  standardAnswers: standardAnswersSchema, metadata: z.record(z.string(), z.unknown()),
});
export const jobPreferencesSchema = z.object({
  desiredRoles: z.array(z.string().max(150)).max(50), locations: z.array(z.string().max(100)).max(50), remotePreference: z.enum(remotePreferences),
  minExperience: z.coerce.number().min(0).max(80), maxExperience: z.coerce.number().min(0).max(80), preferredTechnologies: z.array(z.string().max(100)).max(100), excludedRoles: z.array(z.string().max(150)).max(50),
}).refine((v) => v.maxExperience >= v.minExperience, { message: "Maximum experience must be at least the minimum", path: ["maxExperience"] });
export function commaList(value: string): string[] { return [...new Set(value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean))]; }
