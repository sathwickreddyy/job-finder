import { randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  activityLogs,
  applications,
  jobs,
  resumeMasterRevisions,
  resumes,
  resumeVersions,
} from "@/db/schema";
import { recordApplication } from "@/features/applications/record-service";
import { fitInputSchema, recordFit } from "@/features/resumes/fit/service";
import { appendMasterRevision, getMaster } from "@/features/resumes/master/service";
import { readBuffer, removeFile } from "@/services/storage";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const families: string[] = [],
  files: string[] = [];
const jobIds: string[] = [];
const doc = (text: string) =>
  new File(
    [
      zipSync({
        "[Content_Types].xml": strToU8(
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        "word/document.xml": strToU8(
          `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
        ),
      }),
    ],
    "Example_Master_Resume.docx",
  );
async function anchor() {
  const [r] = await db
    .insert(resumes)
    .values({ name: "Master test", slug: `master-${randomUUID()}` })
    .returning();
  families.push(r.id);
  const [v] = await db
    .insert(resumeVersions)
    .values({
      resumeId: r.id,
      versionLabel: "Baseline",
      originalFilename: "baseline.pdf",
      storagePath: "resumes/00000000-0000-0000-0000-000000000001.pdf",
      sha256: "unchanged",
      fileSize: 10,
      extractedText: "Immutable baseline",
      isCurrent: true,
    })
    .returning();
  return v;
}
describe.skipIf(!dbTests)("master source revisions", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    if (jobIds.length) await db.delete(applications).where(inArray(applications.jobId, jobIds));
    const versions = await db
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(inArray(resumeVersions.resumeId, families));
    if (versions.length) {
      const ids = versions.map((v) => v.id);
      const revisions = await db
        .select()
        .from(resumeMasterRevisions)
        .where(inArray(resumeMasterRevisions.versionId, ids));
      for (const r of revisions) {
        files.push(r.storagePath);
        if (r.pdfStoragePath) files.push(r.pdfStoragePath);
      }
      await db.delete(resumeMasterRevisions).where(inArray(resumeMasterRevisions.versionId, ids));
      await db.delete(activityLogs).where(inArray(activityLogs.entityId, ids));
      await db.delete(resumeVersions).where(inArray(resumeVersions.id, ids));
    }
    if (families.length) await db.delete(resumes).where(inArray(resumes.id, families));
    if (jobIds.length) {
      await db.delete(jobs).where(inArray(jobs.id, jobIds));
    }
    await Promise.all(files.map((p) => removeFile(p)));
    await closeDatabase();
  });
  it("keeps immutable source history while refusing a stale update and leaving the PDF baseline intact", async () => {
    const v = await anchor();
    const firstFile = doc("Earlier wording");
    const first = await appendMasterRevision(v.id, {
      file: firstFile,
      reason: "Historical source",
      expectedRevisionId: null,
      sourceDate: "2026-11-01",
    });
    const second = await appendMasterRevision(v.id, {
      file: doc("Confirmed replacement"),
      reason: "Corrected a fact",
      expectedRevisionId: first.id,
      removedDisposition: "incorrect",
    });
    await expect(
      appendMasterRevision(v.id, {
        file: doc("Stale content"),
        reason: "Old edit",
        expectedRevisionId: first.id,
      }),
    ).rejects.toThrow(/changed|latest/);
    const master = await getMaster(v.id);
    expect(master?.revisions).toHaveLength(2);
    expect(master?.current.id).toBe(second.id);
    expect(master?.current.removedDisposition).toBe("incorrect");
    expect(master?.current.blocks[0].text).toBe("Confirmed replacement");
    expect(
      Buffer.compare(
        await readBuffer(first.storagePath),
        Buffer.from(await firstFile.arrayBuffer()),
      ),
    ).toBe(0);
    const [pdf] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, v.id));
    expect(pdf.sha256).toBe("unchanged");
    expect(pdf.extractedText).toBe("Immutable baseline");
    expect(pdf.isMaster).toBe(true);
  });
  it("allows one explicit master per family and rejects a tailored file as its source anchor", async () => {
    const v = await anchor();
    await appendMasterRevision(v.id, {
      file: doc("Source"),
      reason: "Import",
      expectedRevisionId: null,
    });
    const [other] = await db
      .insert(resumeVersions)
      .values({
        resumeId: v.resumeId,
        versionLabel: "Another PDF",
        originalFilename: "other.pdf",
        storagePath: v.storagePath,
        sha256: "other",
        fileSize: 10,
      })
      .returning();
    await expect(
      appendMasterRevision(other.id, {
        file: doc("Other"),
        reason: "Import",
        expectedRevisionId: null,
      }),
    ).rejects.toThrow(/master/);
    const [still] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, other.id));
    expect(still.isMaster).toBe(false);
  });
  it("rejects a master as a submitted PDF or a job-tailored output", async () => {
    const v = await anchor();
    await db
      .update(resumeVersions)
      .set({ parsingStatus: "COMPLETED" })
      .where(eq(resumeVersions.id, v.id));
    await appendMasterRevision(v.id, {
      file: doc("Source"),
      reason: "Import",
      expectedRevisionId: null,
    });
    const key = randomUUID();
    const [job] = await db
      .insert(jobs)
      .values({
        company: "Fixture",
        title: "Engineer",
        canonicalUrl: `https://fixture.invalid/${key}`,
        dedupeKey: key,
        source: "TEST",
      })
      .returning();
    jobIds.push(job.id);
    await expect(
      db.transaction((tx) =>
        recordApplication(tx, {
          recordId: null,
          jobId: job.id,
          versionId: v.id,
          method: "DIRECT",
          state: "sent",
          notes: "",
          recipient: "",
          url: "",
          sentAt: new Date(),
        }),
      ),
    ).rejects.toThrow(/master|application PDF/);
    await expect(
      recordFit(
        v.id,
        fitInputSchema.parse({
          target: {
            url: `https://fixture.invalid/${key}`,
            company: "Fixture",
            title: "Engineer",
            description: "Java services",
            postedAt: "2026-11-01",
            postedAtKind: "original",
          },
          assessments: [],
        }),
      ),
    ).rejects.toThrow(/master|tailored/);
  });
});
