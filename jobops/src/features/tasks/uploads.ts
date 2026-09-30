import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { missionEvidence, missions, resumeVersions } from "@/db/schema";
import { uploadResumeVersion } from "@/features/resumes/service";
import { MAX_UPLOAD_BYTES, removeFile } from "@/services/storage";
import { TaskError } from "./credentials";
import { stableDigest } from "./domain";

export async function uploadTaskResume(id: string, file: File, label: string, requestId: string) {
  z.uuid().parse(id);
  z.string().min(1).max(120).parse(requestId);
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new TaskError("Choose a PDF up to 10 MiB.");
  if (!label.trim() || label.length > 100)
    throw new TaskError("Give this revision a name of up to 100 characters.");
  const digest = stableDigest({
    sha256: createHash("sha256")
      .update(Buffer.from(await file.arrayBuffer()))
      .digest("hex"),
    filename: file.name,
    label,
  });
  let storedPath: string | undefined;
  try {
    return await db.transaction(async (tx) => {
      const [task] = await tx.select().from(missions).where(eq(missions.id, id)).for("update");
      if (!task || task.input.workflow !== true) throw new TaskError("Task not found.", 404);
      const [previous] = await tx
        .select()
        .from(missionEvidence)
        .where(
          and(
            eq(missionEvidence.missionId, id),
            eq(missionEvidence.type, "RESUME_DRAFT"),
            sql`${missionEvidence.metadata}->>'requestId' = ${requestId}`,
          ),
        );
      if (previous) {
        if (previous.metadata.digest !== digest)
          throw new TaskError(
            "This upload request ID was already used for a different file or label.",
            409,
          );
        return {
          versionId: previous.value,
          filename: String(previous.metadata.originalFilename),
          isCurrent: false,
        };
      }
      if (["COMPLETED", "CANCELLED"].includes(task.status))
        throw new TaskError("This task cannot accept a revision.", 409);
      const baseId = task.input.selectedResumeVersionId;
      if (typeof baseId !== "string")
        throw new TaskError(
          "Select your original resume when creating the task before uploading a revision.",
        );
      const [base] = await tx.select().from(resumeVersions).where(eq(resumeVersions.id, baseId));
      if (!base) throw new TaskError("The original resume is unavailable.");
      const version = await uploadResumeVersion({
        resumeId: base.resumeId,
        versionLabel: label,
        file,
        makeCurrent: false,
        draft: true,
        executor: tx,
      });
      storedPath = version.storagePath;
      await tx
        .insert(missionEvidence)
        .values({
          missionId: id,
          type: "RESUME_DRAFT",
          value: version.id,
          metadata: {
            requestId,
            digest,
            baseVersionId: base.id,
            originalFilename: version.originalFilename,
          },
        });
      return { versionId: version.id, filename: version.originalFilename, isCurrent: false };
    });
  } catch (error) {
    if (storedPath) await removeFile(storedPath).catch(() => undefined);
    throw error;
  }
}

export async function taskResume(id: string, versionId: string) {
  const [task] = await db.select().from(missions).where(eq(missions.id, id));
  if (!task || task.input.workflow !== true) throw new TaskError("Task not found.", 404);
  const [artifact] = await db
    .select({ id: missionEvidence.id })
    .from(missionEvidence)
    .where(
      and(
        eq(missionEvidence.missionId, id),
        eq(missionEvidence.type, "RESUME_DRAFT"),
        eq(missionEvidence.value, versionId),
      ),
    );
  if (task.input.selectedResumeVersionId !== versionId && !artifact)
    throw new TaskError("This resume does not belong to the task.", 403);
  const [version] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, versionId));
  if (!version) throw new TaskError("Resume not found.", 404);
  return version;
}
