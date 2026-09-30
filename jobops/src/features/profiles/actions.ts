"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, profileProviders, profiles } from "@/db/schema";
import { actionError, formJson, formString, type ActionState } from "@/lib/actions";

const profileSchema = z.object({
  provider: z.enum(profileProviders),
  displayName: z.string().trim().min(1).max(200),
  profileUrl: z.url().refine((value) => /^https?:\/\//.test(value), "Use http:// or https://"),
  usernameOrEmail: z
    .string()
    .max(300)
    .transform((v) => v || null),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "UNKNOWN"]),
  knownState: z.record(z.string().max(200), z.unknown()),
  targetState: z.record(z.string().max(200), z.unknown()),
  notes: z.string().max(15000),
  lastInspectedAt: z
    .string()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid inspection date")
    .transform((v) => (v ? new Date(v) : null)),
});
export async function saveProfile(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formString(form, "id");
    if (id) z.uuid().parse(id);
    const data = profileSchema.parse({
      ...Object.fromEntries(
        [
          "provider",
          "displayName",
          "profileUrl",
          "usernameOrEmail",
          "status",
          "notes",
          "lastInspectedAt",
        ].map((key) => [key, formString(form, key)]),
      ),
      knownState: formJson(form, "knownState"),
      targetState: formJson(form, "targetState"),
    });
    const savedId = await db.transaction(async (tx) => {
      const [saved] = id
        ? await tx
            .update(profiles)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(profiles.id, id))
            .returning()
        : await tx.insert(profiles).values(data).returning();
      if (!saved)
        throw new Error("This profile no longer exists. Return to Profiles and choose again.");
      await tx.insert(activityLogs).values({
        action: id ? "PROFILE_UPDATED" : "PROFILE_CREATED",
        entityType: "PROFILE",
        entityId: saved.id,
        summary: `${saved.provider} profile ${id ? "updated" : "created"}`,
        metadata: { fields: Object.keys(data.targetState) },
      });
      return saved.id;
    });
    revalidatePath("/profiles");
    revalidatePath(`/profiles/${savedId}`);
    revalidatePath("/");
    return {
      success:
        "Profile saved. External profile changes must be performed through an approved mission.",
      redirect: `/profiles/${savedId}`,
    };
  } catch (error) {
    return actionError(error);
  }
}
