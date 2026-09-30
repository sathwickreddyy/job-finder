"use server";

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  jobResumeMatches,
  jobSnapshots,
  resumeAssessments,
  resumes,
  resumeVersions,
} from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { retryResumeParsing, setCurrentResumeVersion, uploadResumeVersion } from "./service";
import { MAX_UPLOAD_BYTES } from "@/services/storage";
import { assessmentInput } from "./assessment";
import { indiaDayBoundary } from "@/features/mail/attention";

const familySchema = z.object({
  name: z.string().min(2).max(100),
  category: z.string().min(1).max(80),
  description: z.string().max(2000),
});
const uuid = z.string().uuid();
function refresh(id?: string) {
  revalidatePath("/resumes");
  revalidatePath("/");
  if (id) revalidatePath(`/resumes/${id}`);
}
function parseTags(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

export async function createResumeFamily(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const data = familySchema.parse({
      name: formString(form, "name"),
      category: formString(form, "category") || "General",
      description: formString(form, "description"),
    });
    const slug = `${
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "resume"
    }-${randomUUID().slice(0, 8)}`;
    const family = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(resumes)
        .values({ ...data, slug })
        .returning();
      await tx.insert(activityLogs).values({
        action: "RESUME_FAMILY_CREATED",
        entityType: "RESUME",
        entityId: record.id,
        summary: `Created resume family ${record.name}`,
      });
      return record;
    });
    refresh();
    return {
      redirect: `/resumes/${family.id}`,
      success: "Resume family created. Upload its first PDF version.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateResumeFamily(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = uuid.parse(formString(form, "resumeId"));
    const data = familySchema.parse({
      name: formString(form, "name"),
      category: formString(form, "category"),
      description: formString(form, "description"),
    });
    await db.transaction(async (tx) => {
      const [family] = await tx
        .update(resumes)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(resumes.id, id))
        .returning();
      if (!family) throw new Error("Resume family was not found.");
      await tx.insert(activityLogs).values({
        action: "RESUME_UPDATED",
        entityType: "RESUME",
        entityId: id,
        summary: `Updated ${data.name}`,
      });
    });
    refresh(id);
    return { success: "Resume family updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function uploadVersion(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const resumeId = uuid.parse(formString(form, "resumeId"));
    const versionLabel = z.string().min(1).max(80).parse(formString(form, "versionLabel"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a PDF resume to upload.");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("The PDF exceeds the 10 MB upload limit.");
    const version = await uploadResumeVersion({
      resumeId,
      versionLabel,
      file,
      makeCurrent: form.get("makeCurrent") === "on",
      changeNotes: z.string().max(20000).parse(formString(form, "changeNotes")),
    });
    refresh(resumeId);
    return {
      success:
        version.parsingStatus === "COMPLETED"
          ? "PDF uploaded and text extracted. Review the detected keywords below."
          : "PDF uploaded and preserved. Text extraction needs attention; download/preview and manual keyword editing remain available.",
      redirect: `/resumes/${resumeId}?version=${version.id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveChangeNotes(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "versionId"));
    const changeNotes = z.string().max(20000).parse(formString(form, "changeNotes"));
    const [version] = await db
      .update(resumeVersions)
      .set({ changeNotes })
      .where(eq(resumeVersions.id, id))
      .returning();
    if (!version) throw new Error("This resume file no longer exists.");
    refresh(version.resumeId);
    return { success: "Bullet changes saved for this file." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveAssessment(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const input = assessmentInput.parse(
      Object.fromEntries(
        ["versionId", "snapshotId", "source", "method", "score", "assessedOn", "findings"].map(
          (key) => [key, formString(form, key)],
        ),
      ),
    );
    const assessedAt = indiaDayBoundary(input.assessedOn)!;
    if (assessedAt.valueOf() > Date.now())
      throw new Error("An assessment date cannot be in the future.");
    const familyId = await db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(resumeVersions)
        .where(eq(resumeVersions.id, input.versionId));
      const [snapshot] = await tx
        .select()
        .from(jobSnapshots)
        .where(eq(jobSnapshots.id, input.snapshotId));
      if (!version || !snapshot || !snapshot.description.trim())
        throw new Error("Choose an existing resume and a saved full job description.");
      await tx.insert(resumeAssessments).values({
        versionId: input.versionId,
        snapshotId: input.snapshotId,
        source: input.source,
        method: input.method,
        score: input.score,
        findings: input.findings,
        assessedAt,
      });
      return version.resumeId;
    });
    refresh(familyId);
    return { success: "Assessment saved for this exact file and job description." };
  } catch (error) {
    return actionError(error);
  }
}

export async function selectCurrentVersion(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = await setCurrentResumeVersion(uuid.parse(formString(form, "versionId")));
    refresh(id);
    return {
      success: "Current version selected. Existing applications retain their original resume.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function editVersionKeywords(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = uuid.parse(formString(form, "versionId"));
    const schema = z.array(z.string().min(1).max(100)).max(200);
    const keywords = schema.parse(parseTags(formString(form, "keywords")));
    const skills = schema.parse(parseTags(formString(form, "skills")));
    const experienceTags = schema.parse(parseTags(formString(form, "experienceTags")));
    const summary = z.string().max(5000).parse(formString(form, "summary"));
    const familyId = await db.transaction(async (tx) => {
      const [version] = await tx
        .update(resumeVersions)
        .set({ keywords, skills, experienceTags, summary })
        .where(eq(resumeVersions.id, id))
        .returning();
      if (!version) throw new Error("Resume version was not found.");
      await tx.delete(jobResumeMatches).where(eq(jobResumeMatches.resumeVersionId, id));
      await tx
        .update(resumes)
        .set({ updatedAt: new Date() })
        .where(eq(resumes.id, version.resumeId));
      await tx.insert(activityLogs).values({
        action: "RESUME_TAGS_UPDATED",
        entityType: "RESUME",
        entityId: version.resumeId,
        summary: `Updated keywords and tags for ${version.versionLabel}`,
        metadata: { versionId: id },
      });
      return version.resumeId;
    });
    refresh(familyId);
    return {
      success:
        "Keywords and tags updated. They describe the document without inferring proficiency.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function retryParsing(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = await retryResumeParsing(uuid.parse(formString(form, "versionId")));
    refresh(id);
    return { success: "Text extraction completed. Existing manual keywords were preserved." };
  } catch (error) {
    refresh();
    return actionError(error);
  }
}

export async function toggleArchive(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = uuid.parse(formString(form, "resumeId"));
    const isActive = formString(form, "isActive") === "true";
    await db.transaction(async (tx) => {
      const [family] = await tx
        .update(resumes)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(resumes.id, id))
        .returning();
      if (!family) throw new Error("Resume family was not found.");
      await tx
        .delete(jobResumeMatches)
        .where(
          inArray(
            jobResumeMatches.resumeVersionId,
            tx
              .select({ id: resumeVersions.id })
              .from(resumeVersions)
              .where(eq(resumeVersions.resumeId, id)),
          ),
        );
      await tx.insert(activityLogs).values({
        action: isActive ? "RESUME_RESTORED" : "RESUME_ARCHIVED",
        entityType: "RESUME",
        entityId: id,
        summary: `${isActive ? "Restored" : "Archived"} ${family.name}`,
      });
    });
    refresh(id);
    return {
      success: isActive
        ? "Resume family restored."
        : "Resume family archived. PDF versions and application history remain available.",
    };
  } catch (error) {
    return actionError(error);
  }
}
