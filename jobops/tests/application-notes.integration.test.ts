import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { applications, jobs } from "@/db/schema";
import { PUT } from "@/app/api/v1/applications/[id]/notes/route";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const put = (id: string, body: unknown) =>
  PUT(
    new Request(`http://127.0.0.1:3210/api/v1/applications/${id}/notes`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

describe.skipIf(!dbTests)("application notes API", () => {
  const prefix = `notes-${randomUUID()}`;
  let jobId = "";
  let appId = "";

  beforeAll(async () => {
    await assertE2eDatabase();
    const [job] = await db
      .insert(jobs)
      .values({
        company: `Notes ${prefix}`,
        title: "Engineer",
        canonicalUrl: `https://fixture.invalid/${prefix}`,
        dedupeKey: prefix,
        source: "MANUAL",
        status: "APPLIED",
      })
      .returning();
    jobId = job.id;
    const [app] = await db
      .insert(applications)
      .values({ jobId, source: "DIRECT", status: "APPLIED", appliedAt: new Date() })
      .returning();
    appId = app.id;
  });

  afterAll(async () => {
    await assertE2eDatabase();
    if (appId) await db.delete(applications).where(eq(applications.id, appId));
    if (jobId) await db.delete(jobs).where(eq(jobs.id, jobId));
    await closeDatabase();
  });

  it("replaces the notes and returns the saved text", async () => {
    const notes = "## Summary\n\nApplied on the portal.\n";
    const response = await put(appId, { notes });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notes });
    const [row] = await db.select().from(applications).where(eq(applications.id, appId));
    expect(row.notes).toBe(notes);
    expect((await put(appId, { notes: "" })).status).toBe(200);
    const [cleared] = await db.select().from(applications).where(eq(applications.id, appId));
    expect(cleared.notes).toBe("");
  });

  it("answers 404 for an unknown application", async () => {
    expect((await put(randomUUID(), { notes: "x" })).status).toBe(404);
    expect((await put("not-an-id", { notes: "x" })).status).toBe(404);
  });

  it("answers 400 over the limit or without notes and keeps the stored text", async () => {
    await put(appId, { notes: "kept" });
    expect((await put(appId, { notes: "a".repeat(100_001) })).status).toBe(400);
    expect((await put(appId, {})).status).toBe(400);
    const [row] = await db.select().from(applications).where(eq(applications.id, appId));
    expect(row.notes).toBe("kept");
  });
});
