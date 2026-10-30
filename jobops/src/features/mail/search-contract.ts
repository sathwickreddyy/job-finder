import { z } from "zod";

const phrase = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .refine(
    (value) => !value.includes('"') && !value.includes("\\") &&
      [...value].every((character) => character.charCodeAt(0) >= 32),
    "Use literal words without quotes, backslashes or control characters.",
  );
export const mailSearchSchema = z
  .object({
    accounts: z
      .array(z.email().transform((v) => v.toLowerCase()))
      .min(1)
      .max(10)
      .optional(),
    since: z.iso.datetime({ offset: true }).optional(),
    until: z.iso.datetime({ offset: true }).optional(),
    lastDays: z.number().int().min(1).max(3650).optional(),
    keywords: z.array(phrase).max(10).default([]),
    senders: z.array(z.email().max(254)).max(10).default([]),
    subjects: z.array(phrase).max(10).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.lastDays && value.since)
      ctx.addIssue({
        code: "custom",
        message: "Use since or lastDays, not both.",
        path: ["since"],
      });
    if (value.since && value.until && Date.parse(value.since) >= Date.parse(value.until))
      ctx.addIssue({ code: "custom", message: "since must precede until.", path: ["until"] });
  });
export const mailSearchRequestSchema = z.union([
  z.object({ cursor: z.string().min(1).max(64000) }).strict(),
  mailSearchSchema,
]);
export type MailSearchInput = z.infer<typeof mailSearchSchema>;
export type ResolvedMailSearch = Omit<MailSearchInput, "lastDays" | "since" | "until"> & {
  since?: string;
  until: string;
};
export function resolveMailSearch(input: MailSearchInput, now = new Date()): ResolvedMailSearch {
  const until = new Date(input.until ?? now).toISOString();
  const since = input.lastDays
    ? new Date(Date.parse(until) - input.lastDays * 86400000).toISOString()
    : input.since
      ? new Date(input.since).toISOString()
      : undefined;
  return {
    accounts: input.accounts,
    keywords: input.keywords,
    senders: input.senders,
    subjects: input.subjects,
    since,
    until,
  };
}
