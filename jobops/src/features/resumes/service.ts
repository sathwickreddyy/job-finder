import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  applications,
  jobResumeMatches,
  jobs,
  resumes,
  resumeVersions,
} from "@/db/schema";
import { putBuffer, readBuffer, removeFile, safeFilename } from "@/services/storage";
import { extractPdfText, validatePdf } from "@/services/pdf";
import { extractKeywords } from "@/services/keywords";

export async function listResumes(search = "", includeArchived = false) {
  const conditions = [];
  if (!includeArchived) conditions.push(eq(resumes.isActive, true));
  if (search)
    conditions.push(
      or(
        ilike(resumes.name, `%${search}%`),
        ilike(resumes.category, `%${search}%`),
        ilike(resumes.description, `%${search}%`),
      )!,
    );
  const families = await db
    .select()
    .from(resumes)
    .where(and(...conditions))
    .orderBy(desc(resumes.updatedAt));
  const [versions, usage] = await Promise.all([
    db.select().from(resumeVersions).where(eq(resumeVersions.isCurrent, true)),
    db
      .select({ resumeId: resumeVersions.resumeId, count: count(applications.id) })
      .from(resumeVersions)
      .leftJoin(applications, eq(applications.resumeVersionId, resumeVersions.id))
      .groupBy(resumeVersions.resumeId),
  ]);
  return families.map((family) => ({
    ...family,
    currentVersion: versions.find((version) => version.resumeId === family.id),
    usageCount: usage.find((row) => row.resumeId === family.id)?.count ?? 0,
  }));
}

export async function getResume(id: string) {
  const [resume] = await db.select().from(resumes).where(eq(resumes.id, id));
  if (!resume) return undefined;
  const [versions, usage] = await Promise.all([
    db
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, id))
      .orderBy(desc(resumeVersions.createdAt)),
    db
      .select({
        id: applications.id,
        versionId: applications.resumeVersionId,
        status: applications.status,
        company: jobs.company,
        title: jobs.title,
      })
      .from(applications)
      .innerJoin(resumeVersions, eq(applications.resumeVersionId, resumeVersions.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(resumeVersions.resumeId, id)),
  ]);
  return { ...resume, versions, usage };
}

export async function uploadResumeVersion(input: {
  resumeId: string;
  versionLabel: string;
  file: File;
  makeCurrent: boolean;
}) {
  const bytes = Buffer.from(await input.file.arrayBuffer());
  validatePdf(bytes, input.file.name, input.file.type);
  const stored = await putBuffer(bytes, { namespace: "resumes", extension: "pdf" });
  let extractedText = "";
  let parsingStatus = "COMPLETED";
  let parsingError: string | null = null;
  try {
    extractedText = await extractPdfText(bytes);
    if (!extractedText) {
      parsingStatus = "EMPTY";
      parsingError =
        "No selectable text was found. This may be an image-only PDF. Edit keywords manually or upload a text-based PDF; OCR is not enabled.";
    }
  } catch {
    parsingStatus = "FAILED";
    parsingError =
      "Text extraction failed. The original PDF was retained. Try parsing again or enter keywords manually; password-protected and damaged PDFs may need replacement.";
  }
  try {
    return await db.transaction(async (tx) => {
      const [family] = await tx
        .select()
        .from(resumes)
        .where(eq(resumes.id, input.resumeId))
        .for("update");
      if (!family)
        throw new Error("Resume family no longer exists. Create or select a family first.");
      const [current] = await tx
        .select({ id: resumeVersions.id })
        .from(resumeVersions)
        .where(
          and(eq(resumeVersions.resumeId, input.resumeId), eq(resumeVersions.isCurrent, true)),
        );
      const makeCurrent = input.makeCurrent || !current;
      if (makeCurrent) {
        await tx
          .update(resumeVersions)
          .set({ isCurrent: false })
          .where(eq(resumeVersions.resumeId, input.resumeId));
        await tx
          .delete(jobResumeMatches)
          .where(
            inArray(
              jobResumeMatches.resumeVersionId,
              tx
                .select({ id: resumeVersions.id })
                .from(resumeVersions)
                .where(eq(resumeVersions.resumeId, input.resumeId)),
            ),
          );
      }
      const keywords = extractKeywords(extractedText);
      const [version] = await tx
        .insert(resumeVersions)
        .values({
          resumeId: input.resumeId,
          versionLabel: input.versionLabel,
          originalFilename: safeFilename(input.file.name),
          ...stored,
          extractedText,
          keywords,
          skills: keywords,
          parsingStatus,
          parsingError,
          isCurrent: makeCurrent,
        })
        .returning();
      await tx.update(resumes).set({ updatedAt: new Date() }).where(eq(resumes.id, input.resumeId));
      await tx.insert(activityLogs).values({
        action: "RESUME_UPLOADED",
        entityType: "RESUME",
        entityId: input.resumeId,
        summary: `Uploaded ${family.name} — ${input.versionLabel}`,
        metadata: { versionId: version.id, parsingStatus },
      });
      return version;
    });
  } catch (error) {
    await removeFile(stored.storagePath).catch(() => undefined);
    throw error;
  }
}

export async function setCurrentResumeVersion(versionId: string) {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.id, versionId));
    if (!version) throw new Error("Resume version was not found.");
    await tx
      .select({ id: resumes.id })
      .from(resumes)
      .where(eq(resumes.id, version.resumeId))
      .for("update");
    await tx
      .update(resumeVersions)
      .set({ isCurrent: false })
      .where(eq(resumeVersions.resumeId, version.resumeId));
    await tx
      .update(resumeVersions)
      .set({ isCurrent: true })
      .where(eq(resumeVersions.id, versionId));
    await tx
      .delete(jobResumeMatches)
      .where(
        inArray(
          jobResumeMatches.resumeVersionId,
          tx
            .select({ id: resumeVersions.id })
            .from(resumeVersions)
            .where(eq(resumeVersions.resumeId, version.resumeId)),
        ),
      );
    await tx.update(resumes).set({ updatedAt: new Date() }).where(eq(resumes.id, version.resumeId));
    await tx.insert(activityLogs).values({
      action: "RESUME_VERSION_SELECTED",
      entityType: "RESUME",
      entityId: version.resumeId,
      summary: `Selected ${version.versionLabel} as the current resume`,
      metadata: { versionId },
    });
    return version.resumeId;
  });
}

export async function retryResumeParsing(versionId: string) {
  const [version] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, versionId));
  if (!version) throw new Error("Resume version was not found.");
  try {
    const extractedText = await extractPdfText(await readBuffer(version.storagePath));
    // Manual keywords are preserved during retry. New extraction terms are
    // visible in the text pane and can be deliberately added by the user.
    await db
      .update(resumeVersions)
      .set({
        extractedText,
        parsingStatus: extractedText ? "COMPLETED" : "EMPTY",
        parsingError: extractedText
          ? null
          : "No selectable text found. Edit keywords manually or upload a text-based PDF.",
      })
      .where(eq(resumeVersions.id, versionId));
    return version.resumeId;
  } catch {
    await db
      .update(resumeVersions)
      .set({
        parsingStatus: "FAILED",
        parsingError:
          "Text extraction failed again. The original file is retained; try a non-encrypted, text-based PDF.",
      })
      .where(eq(resumeVersions.id, versionId));
    throw new Error(
      "Text extraction failed again. Your original PDF remains available for preview and download.",
    );
  }
}
