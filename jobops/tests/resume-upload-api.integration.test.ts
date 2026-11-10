import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/resumes/route";
import { closeDatabase, db } from "@/db";
import { activityLogs, resumes, resumeVersions } from "@/db/schema";
import { readBuffer } from "@/services/storage";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe.skipIf(!dbTests)("application résumé upload API", () => {
  let familyId: string | undefined;
  let storage: string | undefined;

  beforeAll(async () => {
    await assertE2eDatabase();
    storage = await mkdtemp(join(tmpdir(), "jobops-resume-upload-"));
    vi.stubEnv("STORAGE_ROOT", storage);
  });

  afterAll(async () => {
    try {
      if (familyId) {
        await assertE2eDatabase();
        await db.delete(activityLogs).where(eq(activityLogs.entityId, familyId));
        await db.delete(resumeVersions).where(eq(resumeVersions.resumeId, familyId));
        await db.delete(resumes).where(eq(resumes.id, familyId));
      }
    } finally {
      await closeDatabase();
      vi.unstubAllEnvs();
      if (storage) await rm(storage, { recursive: true, force: true });
    }
  });

  const request = (form: FormData) =>
    new Request("http://localhost:3210/api/v1/resumes", { method: "POST", body: form });

  it("stores exact bytes once under concurrent retries and preserves the current file", async () => {
    const [family] = await db
      .insert(resumes)
      .values({ name: "Upload fixture", slug: `upload-fixture-${randomUUID()}` })
      .returning();
    familyId = family.id;
    const [baseline] = await db
      .insert(resumeVersions)
      .values({
        resumeId: family.id,
        versionLabel: "Existing default",
        originalFilename: "baseline.pdf",
        storagePath: `resumes/${randomUUID()}.pdf`,
        sha256: "fixture",
        fileSize: 10,
        isCurrent: true,
      })
      .returning();
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("Example backend engineer");
    const bytes = Buffer.from(await pdf.save());
    const form = new FormData();
    form.set("file", new File([bytes], "Example_Resume.pdf", { type: "application/pdf" }));
    form.set("resumeId", family.id);
    form.set("versionLabel", "Application PDF");
    const responses = await Promise.all([POST(request(form)), POST(request(form))]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(results[0]).toMatchObject({
      versionId: results[1].versionId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      isCurrent: false,
      parsingStatus: "COMPLETED",
    });
    const versions = await db
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, family.id));
    expect(versions.filter((v) => v.isCurrent).map((v) => v.id)).toEqual([baseline.id]);
    expect(versions).toHaveLength(2);
    expect(
      await readBuffer(versions.find((v) => v.id === results[0].versionId)!.storagePath),
    ).toEqual(bytes);
    const index = await (await GET()).json();
    expect(index.resumes).toContainEqual(
      expect.objectContaining({ id: baseline.id, resumeId: family.id }),
    );

    form.set("path", "/tmp/ignored.pdf");
    expect((await POST(request(form))).status).toBe(400);
    form.delete("path");
    form.set("file", new File(["invalid"], "fake.pdf", { type: "application/pdf" }));
    expect((await POST(request(form))).status).toBe(400);
  });
});
