"use server";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, candidateProfiles, profiles, resumes, settings } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { contextSchema, httpUrl } from "@/features/tasks/domain";
import { uploadResumeVersion } from "@/features/resumes/service";
import { MAX_UPLOAD_BYTES } from "@/services/storage";
import { validatePdf } from "@/services/pdf";

function refresh() {
  revalidatePath("/", "layout");
}
export async function saveWorkingContext(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = contextSchema.parse(formString(form, "context"));
    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({ key: "workingPreferences", value: { context } })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: { context }, updatedAt: new Date() },
        });
      await tx.insert(activityLogs).values({
        action: "WORKING_CONTEXT_UPDATED",
        entityType: "SETTINGS",
        summary: "Working preferences updated by you",
      });
    });
    refresh();
    return {
      success: "Preferences saved. New prompts will include this context.",
    };
  } catch (e) {
    return actionError(e);
  }
}
export async function saveProfileBasics(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const text = z
      .string()
      .trim()
      .max(2000)
      .transform((v) => v || null);
    const url = z.union([z.literal(""), httpUrl]).transform((v) => v || null);
    const schema = z.object({
      fullName: text,
      currentRole: text,
      currentCity: text,
      noticePeriod: text,
      careerSummary: z
        .string()
        .max(15000)
        .transform((v) => v || null),
      linkedinUrl: url,
      githubUrl: url,
      portfolioUrl: url,
    });
    const data = schema.parse(
      Object.fromEntries(Object.keys(schema.shape).map((k) => [k, formString(form, k)])),
    );
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(8093212)`);
      const [candidate] = await tx.select().from(candidateProfiles).limit(1);
      if (candidate)
        await tx
          .update(candidateProfiles)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(candidateProfiles.id, candidate.id));
      else await tx.insert(candidateProfiles).values({ ...data, country: "India" });
      for (const [field, displayName] of [
        ["linkedinUrl", "LinkedIn"],
        ["githubUrl", "GitHub"],
        ["portfolioUrl", "Portfolio"],
      ] as const) {
        const profileUrl = data[field];
        if (!profileUrl) continue;
        const [existing] = await tx
          .select()
          .from(profiles)
          .where(
            sql`${profiles.knownState}->>'canonicalField' = ${field} OR ${profiles.profileUrl} = ${profileUrl}`,
          )
          .limit(1);
        const values = {
          profileUrl,
          knownState: { ...(existing?.knownState ?? {}), canonicalField: field },
        };
        if (existing)
          await tx
            .update(profiles)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(profiles.id, existing.id));
        else
          await tx.insert(profiles).values({
            ...values,
            provider: field === "linkedinUrl" ? "LINKEDIN" : "OTHER",
            displayName,
          });
      }
      await tx.insert(activityLogs).values({
        action: "PROFILE_BASICS_UPDATED",
        entityType: "CANDIDATE",
        summary: "Profile details and public links updated by you",
      });
    });
    refresh();
    return { success: "Your profile and public links are saved." };
  } catch (e) {
    return actionError(e);
  }
}
export async function savePublicProfile(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const data = z
      .object({
        id: z.union([z.literal(""), z.uuid()]),
        displayName: z.string().trim().min(1).max(150),
        profileUrl: httpUrl,
        provider: z.enum(["LINKEDIN", "NAUKRI", "INSTAHYRE", "CUTSHORT", "OTHER"]),
        notes: z.string().trim().max(10000),
      })
      .parse({
        id: formString(form, "id"),
        displayName: formString(form, "displayName"),
        profileUrl: formString(form, "profileUrl"),
        provider: formString(form, "provider"),
        notes: formString(form, "notes"),
      });
    await db.transaction(async (tx) => {
      const values = {
        displayName: data.displayName,
        profileUrl: data.profileUrl,
        provider: data.provider,
        notes: data.notes,
      };
      if (data.id) {
        const [updated] = await tx
          .update(profiles)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(profiles.id, data.id))
          .returning();
        if (!updated) throw new Error("This profile is no longer available.");
        const field = updated.knownState.canonicalField;
        if (["linkedinUrl", "githubUrl", "portfolioUrl"].includes(String(field))) {
          const [candidate] = await tx.select().from(candidateProfiles).limit(1);
          if (candidate)
            await tx
              .update(candidateProfiles)
              .set({ [String(field)]: data.profileUrl, updatedAt: new Date() })
              .where(eq(candidateProfiles.id, candidate.id));
        }
      } else await tx.insert(profiles).values(values);
      await tx.insert(activityLogs).values({
        action: "PUBLIC_PROFILE_SAVED",
        entityType: "PROFILE",
        entityId: data.id || null,
        summary: `Saved ${data.displayName}`,
      });
    });
    refresh();
    return { success: "Profile link saved. It now appears on Home." };
  } catch (e) {
    return actionError(e);
  }
}
export async function quickResumeUpload(_state: ActionState, form: FormData): Promise<ActionState> {
  let createdId: string | undefined;
  try {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_UPLOAD_BYTES)
      throw new Error("Choose a PDF up to 10 MiB.");
    validatePdf(Buffer.from(await file.arrayBuffer()), file.name, file.type);
    const name = z
      .string()
      .trim()
      .min(1)
      .max(100)
      .parse(formString(form, "name") || "My resume");
    const [family] = await db
      .insert(resumes)
      .values({ name, slug: `resume-${randomUUID()}`, category: "General", description: "" })
      .returning();
    createdId = family.id;
    await uploadResumeVersion({
      resumeId: family.id,
      versionLabel: "Original",
      file,
      makeCurrent: true,
    });
    refresh();
    return { success: "Resume saved. Use the resume prompt when you have a job description." };
  } catch (e) {
    if (createdId)
      await db
        .delete(resumes)
        .where(eq(resumes.id, createdId))
        .catch(() => undefined);
    return actionError(e);
  }
}
