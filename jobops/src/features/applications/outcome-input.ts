import { z } from "zod";
import { roundKinds } from "@/lib/round-kinds";
import type { OutcomeDetail } from "./phase";

const instant = z.iso.datetime({ offset: true });

export const outcomeDetailsSchema = z.strictObject({
  note: z.string().max(2000).optional(),
  name: z.string().max(200).optional(),
  kind: z.enum(roundKinds).optional(),
  at: instant.optional(),
  happenedAt: instant
    .refine((value) => Date.parse(value) <= Date.now(), "When it happened cannot be in the future.")
    .optional(),
});

export function readOutcomeDetails(
  details: z.infer<typeof outcomeDetailsSchema> | undefined,
  defaultHappenedAt: Date,
): OutcomeDetail {
  return {
    kind: details?.kind,
    at: details?.at ? new Date(details.at) : undefined,
    name: details?.name ?? "",
    note: details?.note ?? "",
    happenedAt: details?.happenedAt ? new Date(details.happenedAt) : defaultHappenedAt,
  };
}
