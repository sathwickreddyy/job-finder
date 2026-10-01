"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { jobs, jobSnapshots, jobResumeMatches, jobStatuses, activityLogs } from "@/db/schema";
import { type ActionState, actionError, formString } from "@/lib/actions";
import { jobInputSchema, parseJobImport, type ImportPreview } from "./import";
import { findImportDuplicates, importJobRows, saveJobMatches } from "./service";
export type ImportState = ActionState & {
  preview?: ImportPreview;
  summary?: { created: number; merged: number; skipped: number };
};
export async function previewJobs(_state: ImportState, form: FormData): Promise<ImportState> {
  try {
    const format = z.enum(["json", "csv"]).parse(formString(form, "format"));
    return {
      preview: await findImportDuplicates(parseJobImport(formString(form, "records"), format)),
    };
  } catch (e) {
    return actionError(e);
  }
}
export async function commitJobs(_state: ImportState, form: FormData): Promise<ImportState> {
  try {
    const format = z.enum(["json", "csv"]).parse(formString(form, "format")),
      strategy = z.enum(["skip", "merge"]).parse(formString(form, "strategy"));
    const preview = parseJobImport(formString(form, "records"), format);
    if (!preview.valid) return { preview, error: "Correct the highlighted rows before importing." };
    const summary = await importJobRows(
      preview.rows.map((r) => r.data!),
      strategy,
    );
    revalidatePath("/jobs");
    revalidatePath("/companies");
    revalidatePath("/");
    return {
      summary,
      success: `Imported ${summary.created} new jobs; merged ${summary.merged}; skipped ${summary.skipped}.`,
    };
  } catch (e) {
    return actionError(e);
  }
}
export async function addJob(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    if (!formString(form, "description"))
      throw new Error("Paste the full job description before saving.");
    if (!formString(form, "source")) {
      const host = new URL(formString(form, "url")).hostname.toLowerCase();
      const provider = ["linkedin", "naukri", "instahyre", "cutshort", "hirist"].find(
        (name) =>
          host === `${name}.com` ||
          host.endsWith(`.${name}.com`) ||
          host === `${name}.io` ||
          host.endsWith(`.${name}.io`) ||
          host === `${name}.tech` ||
          host.endsWith(`.${name}.tech`),
      );
      form.set("source", provider?.toUpperCase() || "COMPANY_CAREERS");
    }
    const data = jobInputSchema.parse(
      Object.fromEntries([...form.entries()].map(([k, v]) => [k, v === "" ? undefined : v])),
    );
    const summary = await importJobRows([data], "skip");
    if (!summary.created)
      return {
        error: "This opening is already saved. Open Saved openings to review it.",
      };
    revalidatePath("/jobs");
    revalidatePath("/companies");
    revalidatePath("/");
    return { redirect: `/jobs/${summary.ids[0]}` };
  } catch (e) {
    return actionError(e);
  }
}
export async function changeJob(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const status = z.enum(jobStatuses).parse(formString(form, "status"));
    const notes = z.string().max(20000).parse(formString(form, "notes"));
    await db.transaction(async (tx) => {
      const [job] = await tx
        .update(jobs)
        .set({ status, notes, updatedAt: new Date() })
        .where(eq(jobs.id, id))
        .returning();
      if (!job) throw new Error("Job no longer exists.");
      await tx.insert(activityLogs).values({
        action: "JOB_UPDATED",
        entityType: "JOB",
        entityId: id,
        summary: `${job.company} — ${job.title}: ${status}`,
      });
    });
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    revalidatePath("/");
    return { success: "Job saved." };
  } catch (e) {
    return actionError(e);
  }
}
export async function updateJobDescription(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const input = z
      .object({
        id: z.uuid(),
        description: z.string().max(100000),
        keywords: z.array(z.string().trim().min(1).max(100)).max(200),
        requirements: z.array(z.string().max(2000)).max(100),
      })
      .parse({
        id: formString(form, "id"),
        description: formString(form, "description"),
        keywords: formString(form, "keywords")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        requirements: formString(form, "requirements").split("\n").filter(Boolean),
      });
    await db.transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, input.id)).limit(1);
      if (!job) throw new Error("Job no longer exists.");
      await tx.insert(jobSnapshots).values({
        jobId: input.id,
        description: input.description,
        rawText: input.description,
        skills: input.keywords,
        requirements: input.requirements,
        metadata: { source: "MANUAL_EDIT" },
      });
      await tx.delete(jobResumeMatches).where(eq(jobResumeMatches.jobId, input.id));
      await tx.insert(activityLogs).values({
        action: "JOB_SNAPSHOT_CREATED",
        entityType: "JOB",
        entityId: input.id,
        summary: "Saved job description and keyword snapshot",
      });
    });
    revalidatePath(`/jobs/${input.id}`);
    return { success: "New snapshot saved. Previous descriptions remain in history." };
  } catch (e) {
    return actionError(e);
  }
}
export async function compareResumes(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    await saveJobMatches(id);
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    return { success: "Keyword comparisons saved for current resume versions." };
  } catch (e) {
    return actionError(e);
  }
}
