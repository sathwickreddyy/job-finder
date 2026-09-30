"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, candidateProfiles, operators, settings } from "@/db/schema";
import { actionError, formJson, formString, type ActionState } from "@/lib/actions";
import {
  candidateSchema,
  commaList,
  jobPreferencesSchema,
  missionPrioritySchema,
} from "./validation";

export async function saveCandidate(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const fields = [
      "fullName",
      "preferredName",
      "primaryEmail",
      "phone",
      "currentCity",
      "country",
      "yearsOfExperience",
      "currentCompany",
      "currentRole",
      "currentCompensation",
      "expectedCompensation",
      "noticePeriod",
      "lastWorkingDay",
      "remotePreference",
      "linkedinUrl",
      "githubUrl",
      "portfolioUrl",
      "careerSummary",
      "workAuthorization",
      "sponsorship",
      "relocationPreference",
    ];
    const data = candidateSchema.parse({
      ...Object.fromEntries(fields.map((key) => [key, formString(form, key)])),
      preferredLocations: commaList(formString(form, "preferredLocations")),
      desiredRoles: commaList(formString(form, "desiredRoles")),
      standardAnswers: formJson(form, "standardAnswers"),
      metadata: formJson(form, "metadata"),
    });
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(candidateProfiles).limit(1);
      const [saved] = current
        ? await tx
            .update(candidateProfiles)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(candidateProfiles.id, current.id))
            .returning()
        : await tx.insert(candidateProfiles).values(data).returning();
      await tx.insert(activityLogs).values({
        action: "CANDIDATE_UPDATED",
        entityType: "CANDIDATE",
        entityId: saved.id,
        summary: "Canonical candidate profile and standard answers updated",
      });
    });
    revalidatePath("/settings");
    revalidatePath("/missions/new");
    revalidatePath("/");
    return { success: "Candidate profile saved. Unknown answers remain explicitly UNKNOWN." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveJobPreferences(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const data = jobPreferencesSchema.parse({
      desiredRoles: commaList(formString(form, "desiredRoles")),
      locations: commaList(formString(form, "locations")),
      remotePreference: formString(form, "remotePreference"),
      minExperience: formString(form, "minExperience"),
      maxExperience: formString(form, "maxExperience"),
      preferredTechnologies: commaList(formString(form, "preferredTechnologies")),
      excludedRoles: commaList(formString(form, "excludedRoles")),
    });
    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({ key: "jobPreferences", value: data })
        .onConflictDoUpdate({ target: settings.key, set: { value: data, updatedAt: new Date() } });
      const [current] = await tx.select().from(candidateProfiles).limit(1);
      const values = {
        desiredRoles: data.desiredRoles,
        preferredLocations: data.locations,
        remotePreference: data.remotePreference,
        metadata: { ...(current?.metadata ?? {}), jobPreferences: data },
        updatedAt: new Date(),
      };
      if (current)
        await tx.update(candidateProfiles).set(values).where(eq(candidateProfiles.id, current.id));
      else await tx.insert(candidateProfiles).values(values);
      await tx.insert(activityLogs).values({
        action: "PREFERENCES_UPDATED",
        entityType: "SETTINGS",
        summary: "Job discovery preferences updated",
      });
    });
    revalidatePath("/settings");
    revalidatePath("/missions/new");
    revalidatePath("/");
    return { success: "Job preferences saved for new discovery missions." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveMissionDefaults(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const value = z
      .object({
        operator: z.enum(operators),
        priority: missionPrioritySchema,
        maxResults: z.coerce.number().int().min(1).max(100),
        freshnessDays: z.coerce.number().int().min(1).max(365),
        requireApproval: z.literal(true),
      })
      .parse({
        operator: formString(form, "operator"),
        priority: formString(form, "priority"),
        maxResults: formString(form, "maxResults"),
        freshnessDays: formString(form, "freshnessDays"),
        requireApproval: true,
      });
    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({ key: "missionDefaults", value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
      await tx.insert(activityLogs).values({
        action: "MISSION_DEFAULTS_UPDATED",
        entityType: "SETTINGS",
        summary: "Default operator and discovery limits updated",
      });
    });
    revalidatePath("/settings");
    revalidatePath("/missions/new");
    revalidatePath("/");
    return { success: "Mission defaults saved. External submissions still require approval." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveAppPreferences(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const value = z
      .object({
        timezone: z
          .string()
          .max(100)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }, "Enter a valid IANA timezone, such as Asia/Kolkata"),
        dateFormat: z.enum(["ISO", "LOCAL"]),
      })
      .parse({
        timezone: formString(form, "timezone"),
        dateFormat: formString(form, "dateFormat"),
      });
    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({ key: "appPreferences", value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
      await tx.insert(activityLogs).values({
        action: "APP_PREFERENCES_UPDATED",
        entityType: "SETTINGS",
        summary: "Application display preferences updated",
      });
    });
    revalidatePath("/", "layout");
    return { success: "Application preferences saved." };
  } catch (error) {
    return actionError(error);
  }
}
