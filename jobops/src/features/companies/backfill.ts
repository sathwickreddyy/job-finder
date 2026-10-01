import { z, ZodError } from "zod";
import { mergeData, validateFact } from "./validation";

/** Contract problems of a stored fact as `path: message` lines; empty means it conforms. */
export function factProblems(fact: Record<string, unknown>): string[] {
  try {
    validateFact(fact);
    return [];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }
}

export const previewPatch = (current: Record<string, unknown>, patch: Record<string, unknown>) =>
  mergeData(current, patch) as Record<string, unknown>;

const reviewItem = z
  .object({
    companySlug: z.string().min(1),
    factKey: z.string().min(1),
    category: z.enum(["COMPENSATION", "INTERVIEW"]),
    problems: z.array(z.string()),
    current: z.record(z.string(), z.unknown()),
    patch: z.record(z.string(), z.unknown()).nullable(),
    ambiguous: z.string().min(1).nullable(),
  })
  .refine((item) => (item.patch === null) !== (item.ambiguous === null), {
    message: "Each item needs exactly one of patch or ambiguous.",
  });
export const reviewFileSchema = z.object({ generatedAt: z.string(), items: z.array(reviewItem) });
export type ReviewItem = z.infer<typeof reviewItem>;
