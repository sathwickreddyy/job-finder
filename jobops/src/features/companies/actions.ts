"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { companyRecords, companyLocations, resumes, settings } from "@/db/schema";
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
      const [company] = await tx
        .select()
        .from(companyRecords)
        .where(and(eq(companyRecords.slug, value.companyId), eq(companyRecords.status, "ACTIVE")));
      if (!company) throw new Error("This company is no longer active. Refresh the page.");
      const locations = await tx
        .select()
        .from(companyLocations)
        .where(eq(companyLocations.companyId, company.id));
      if (
        !locations.some((location) => location.city === value.city) &&
        !(value.city === "Location not recorded" && locations.length === 0)
      )
        throw new Error("Choose a city recorded for this company. Refresh the page.");
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
    revalidatePath(`/companies/${value.companyId}`);
    return {
      success: value.resumeId
        ? "Resume linked. This card follows its current revision."
        : "Resume reference cleared. Using your latest recorded application when available.",
    };
  } catch (error) {
    return actionError(error);
  }
}
