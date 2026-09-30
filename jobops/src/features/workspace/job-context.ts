import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jobs, jobSnapshots } from "@/db/schema";
export async function getJobContext(id?: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [[job], snapshots] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, id!)),
    db
      .select()
      .from(jobSnapshots)
      .where(eq(jobSnapshots.jobId, id!))
      .orderBy(desc(jobSnapshots.capturedAt)),
  ]);
  return job ? { job, snapshot: snapshots[0], snapshots } : null;
}
