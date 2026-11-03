import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  applications,
  resumes,
  resumeVersions,
  resumeMasterRevisions,
} from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { putBuffer, removeFile, safeFilename } from "@/services/storage";
import { validatePdf } from "@/services/pdf";
import { readMasterDocx } from "./document";

const metadata = z.object({
  reason: z.string().trim().min(1).max(4000),
  expectedRevisionId: z.uuid().nullable(),
  sourceDate: z.iso.date().optional(),
  removedDisposition: z.enum(["retained", "incorrect"]).default("retained"),
});
export type MasterInput = z.input<typeof metadata> & { file: File; pdf?: File };

export async function getMaster(versionId: string) {
  const [version] = await db
    .select({ id: resumeVersions.id })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.isMaster, true)));
  if (!version) return null;
  const revisions = await db
    .select()
    .from(resumeMasterRevisions)
    .where(eq(resumeMasterRevisions.versionId, versionId))
    .orderBy(desc(resumeMasterRevisions.createdAt), desc(resumeMasterRevisions.id));
  return revisions.length ? { versionId, current: revisions[0], revisions } : null;
}
export type Master = NonNullable<Awaited<ReturnType<typeof getMaster>>>;

export async function listMasterSources() {
  const sources = await db
    .select({ id: resumeVersions.id, family: resumes.name })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(and(eq(resumeVersions.isMaster, true), eq(resumes.isActive, true)));
  return Promise.all(
    sources.map(async (source) => {
      const master = await getMaster(source.id);
      return {
        ...source,
        revisionId: master?.current.id ?? null,
        docxUrl: `/api/v1/resumes/${source.id}/master/file`,
      };
    }),
  );
}

export async function appendMasterRevision(versionId: string, input: MasterInput) {
  const meta = metadata.parse(input);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const blocks = readMasterDocx(bytes, input.file.name);
  let pdfBytes: Buffer | undefined;
  if (input.pdf?.size) {
    pdfBytes = Buffer.from(await input.pdf.arrayBuffer());
    validatePdf(pdfBytes, input.pdf.name, input.pdf.type);
  }
  // Store files inside the row-locked operation only after all identity/staleness checks.
  const stored: string[] = [];
  try {
    return await db.transaction(async (tx) => {
      const [found] = await tx
        .select()
        .from(resumeVersions)
        .where(eq(resumeVersions.id, versionId));
      if (!found) throw new ApiError("Unknown résumé file.", 404);
      const [family] = await tx
        .select()
        .from(resumes)
        .where(eq(resumes.id, found.resumeId))
        .for("update");
      if (!family.isActive)
        throw new ApiError("Restore this résumé family before updating its master.", 409);
      const [version] = await tx
        .select()
        .from(resumeVersions)
        .where(eq(resumeVersions.id, versionId))
        .for("update");
      const [other] = await tx
        .select({ id: resumeVersions.id })
        .from(resumeVersions)
        .where(and(eq(resumeVersions.resumeId, found.resumeId), eq(resumeVersions.isMaster, true)));
      if (other && other.id !== versionId)
        throw new ApiError("This family already has a master résumé.", 409);
      if (!version.isMaster) {
        const [use] = await tx
          .select({ id: applications.id })
          .from(applications)
          .where(eq(applications.resumeVersionId, versionId))
          .limit(1);
        if (use || version.targetJobId || version.baseVersionId)
          throw new ApiError("Use an unsubmitted, untailored source as the master résumé.", 409);
      }
      const [previous] = await tx
        .select()
        .from(resumeMasterRevisions)
        .where(eq(resumeMasterRevisions.versionId, versionId))
        .orderBy(desc(resumeMasterRevisions.createdAt), desc(resumeMasterRevisions.id))
        .limit(1);
      if ((previous?.id ?? null) !== meta.expectedRevisionId)
        throw new ApiError(
          "The master changed. Reload the latest revision before saving your edit.",
          409,
        );
      // Dates are display provenance; recording time always stays the actual write time.
      if (meta.sourceDate && previous?.sourceDate && meta.sourceDate < previous.sourceDate)
        throw new ApiError("Historical source dates must be imported in order.", 409);
      const docx = await putBuffer(bytes, { namespace: "resume-masters", extension: "docx" });
      stored.push(docx.storagePath);
      const pdf = pdfBytes
        ? await putBuffer(pdfBytes, { namespace: "resume-masters", extension: "pdf" })
        : null;
      if (pdf) stored.push(pdf.storagePath);
      const [revision] = await tx
        .insert(resumeMasterRevisions)
        .values({
          reason: meta.reason,
          sourceDate: meta.sourceDate,
          removedDisposition: meta.removedDisposition,
          versionId,
          blocks,
          ...docx,
          originalFilename: safeFilename(input.file.name),
          pdfStoragePath: pdf?.storagePath ?? null,
          pdfFilename: pdf ? safeFilename(input.pdf!.name) : null,
          // monotonic even for fast sequential imports in the same clock millisecond
          createdAt: new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1)),
        })
        .returning();
      await tx
        .update(resumeVersions)
        .set({ isMaster: true })
        .where(eq(resumeVersions.id, versionId));
      await tx.insert(activityLogs).values({
        action: "RESUME_MASTER_UPDATED",
        entityType: "RESUME",
        entityId: versionId,
        summary: "Recorded an editable master résumé revision",
        metadata: {
          revisionId: revision.id,
          reason: meta.reason,
          previousRevisionId: previous?.id ?? null,
        },
      });
      return revision;
    });
  } catch (error) {
    await Promise.all(stored.map((p) => removeFile(p).catch(() => undefined)));
    throw error;
  }
}

export async function masterRevisionFile(
  versionId: string,
  revisionId: string | null,
  pdf = false,
) {
  const master = await getMaster(versionId);
  const revision = revisionId
    ? master?.revisions.find((r) => r.id === revisionId)
    : master?.current;
  if (!revision) throw new ApiError("Unknown master revision.", 404);
  if (pdf && !revision.pdfStoragePath)
    throw new ApiError("No PDF export was supplied for this revision.", 404);
  return {
    storagePath: pdf ? revision.pdfStoragePath! : revision.storagePath,
    filename: pdf ? revision.pdfFilename! : revision.originalFilename,
    mimeType: pdf
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
