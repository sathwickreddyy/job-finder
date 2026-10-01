"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { resumes, settings } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { companyResumeKey, companyResumeSchema } from "./domain";

export async function saveCompanyResume(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const value = companyResumeSchema.parse({
      companyId: formString(form, "companyId"),
      city: formString(form, "city"),
      resumeId: formString(form, "resumeId"),
    });
    const key = companyResumeKey(value.companyId, value.city);
    await db.transaction(async (tx) => {
      if (!value.resumeId) {
        await tx.delete(settings).where(eq(settings.key, key));
        return;
      }
      const [family] = await tx
        .select({ id: resumes.id })
        .from(resumes)
        .where(and(eq(resumes.id, value.resumeId), eq(resumes.isActive, true)));
      if (!family) throw new Error("Choose an active resume. Refresh the page and try again.");
      await tx
        .insert(settings)
        .values({ key, value: { resumeId: family.id } })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: { resumeId: family.id }, updatedAt: new Date() },
        });
    });
    revalidatePath("/companies");
    return {
      success: value.resumeId
        ? "Resume linked. This card follows its current revision."
        : "Resume reference cleared. Using your latest recorded application when available.",
    };
  } catch (error) {
    return actionError(error);
  }
}
