import { createHash } from "node:crypto";
import { z } from "zod";
import { jobInputSchema } from "@/features/jobs/import";

import { taskKinds, assistants } from "./catalog";
export { taskKinds, assistants, taskStarters } from "./catalog";

export const httpUrl = z
  .url()
  .max(2000)
  .refine((v) => ["https:", "http:"].includes(new URL(v).protocol), "Use an http or https URL");
export const contextSchema = z.string().trim().max(20000);
export const createTaskSchema = z
  .object({
    kind: z.enum(taskKinds),
    title: z.string().trim().min(2).max(180),
    goal: z.string().trim().min(10).max(20000),
    context: contextSchema,
    assistant: z.enum(assistants),
    jobId: z.uuid().optional(),
    profileId: z.uuid().optional(),
    resumeVersionId: z.uuid().optional(),
  })
  .strict();
const requestId = z.string().trim().min(1).max(120);
const summary = z.string().trim().min(3).max(5000);
const shortText = z.string().trim().min(1).max(5000);
const payload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("OPENINGS"), jobs: z.array(jobInputSchema).min(1).max(50) }).strict(),
  z.object({ kind: z.literal("RESUME"), versionId: z.uuid(), changes: shortText }).strict(),
  z
    .object({
      kind: z.literal("PROFILE"),
      targetUrl: httpUrl,
      changes: z
        .array(
          z
            .object({
              field: z.string().min(1).max(100),
              before: z.string().max(10000),
              after: z.string().min(1).max(10000),
            })
            .strict(),
        )
        .min(1)
        .max(30),
    })
    .strict(),
  z
    .object({
      kind: z.literal("APPLICATION"),
      jobId: z.uuid(),
      resumeVersionId: z.uuid(),
      targetUrl: httpUrl,
      answers: z.record(z.string().max(300), z.string().max(4000)),
      questions: z.array(z.string().max(2000)).max(30).default([]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("OUTREACH"),
      channel: z.enum(["REFERRAL", "COLD_EMAIL", "LINKEDIN"]),
      recipient: shortText,
      destination: shortText,
      draft: z.string().trim().min(10).max(20000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("SHOWCASE"),
      targetUrl: httpUrl,
      title: z.string().min(1).max(180),
      content: z.string().trim().min(10).max(40000),
    })
    .strict(),
  z.object({ kind: z.literal("PREFERENCES"), context: contextSchema.min(1) }).strict(),
  z.object({ kind: z.literal("NOTE"), content: z.string().trim().min(1).max(20000) }).strict(),
]);
export const proposalSchema = z.object({ requestId, summary, payload }).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const updateSchema = z
  .object({
    requestId,
    summary,
    status: z.enum(["IN_PROGRESS", "WAITING_FOR_USER", "FAILED", "EXECUTED"]),
    proposalId: z.uuid().optional(),
    evidenceUrl: httpUrl.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === "EXECUTED" && !v.proposalId)
      ctx.addIssue({
        code: "custom",
        path: ["proposalId"],
        message: "Execution requires an approved proposal.",
      });
    if (v.status !== "EXECUTED" && v.proposalId)
      ctx.addIssue({
        code: "custom",
        path: ["proposalId"],
        message: "Only an execution report can reference an approval.",
      });
  });
export const externalKinds = ["PROFILE", "APPLICATION", "OUTREACH", "SHOWCASE"];
export function stableDigest(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export const taskGuardrails = {
  region: "India; remote roles must explicitly allow working from India.",
  sources: [
    "LinkedIn India",
    "Naukri",
    "Instahyre",
    "Cutshort",
    "Hirist",
    "Company careers — India",
  ],
  facts:
    "Do not invent skills, employment, contact details or application answers. Ask me about unknowns.",
  approval:
    "Propose exact changes first. Apply, send, publish or change portal data only after a human APPROVE decision for that exact proposal. A revised proposal needs fresh approval.",
  memory:
    "Use what you already know about me as context, then reconcile it with me. Suggest preference changes instead of silently overwriting confirmed facts.",
};
