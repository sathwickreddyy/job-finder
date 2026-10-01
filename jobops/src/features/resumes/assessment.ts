import { z } from "zod";
import { indiaDayBoundary } from "@/features/mail/attention";
export const assessmentInput = z.object({
  versionId: z.uuid(),
  snapshotId: z.uuid(),
  source: z.string().trim().min(1).max(200),
  method: z.string().trim().min(1).max(5000),
  score: z.preprocess(
    (value) =>
      value === "" || value === undefined || value === null
        ? null
        : typeof value === "string"
          ? Number(value)
          : value,
    z.number().finite().min(0).max(100).nullable(),
  ),
  findings: z.string().trim().max(20000),
  assessedOn: z
    .string()
    .refine(
      (value) => Boolean(indiaDayBoundary(value)),
      "Use a valid assessment date in India time.",
    ),
});
