import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { missions, taskCredentials } from "@/db/schema";

export class TaskError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hashTaskCredential = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function requireProtectedWorkspace() {
  if (!process.env.JOBOPS_ACCESS_TOKEN || process.env.JOBOPS_ACCESS_TOKEN.length < 32)
    throw new TaskError(
      "Enable a workspace access key before using the agent API. Browser-only handoffs remain available.",
      503,
    );
}
export async function issueTaskCredential(missionId: string) {
  requireProtectedWorkspace();
  z.uuid().parse(missionId);
  const [task] = await db.select().from(missions).where(eq(missions.id, missionId));
  if (!task || task.input.workflow !== true) throw new TaskError("Task not found.", 404);
  const token = `jobops_task_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.transaction(async (tx) => {
    await tx
      .select({ id: missions.id })
      .from(missions)
      .where(eq(missions.id, missionId))
      .for("update");
    await tx
      .update(taskCredentials)
      .set({ revokedAt: new Date() })
      .where(eq(taskCredentials.missionId, missionId));
    await tx
      .insert(taskCredentials)
      .values({ missionId, digest: hashTaskCredential(token), expiresAt });
  });
  return { token, expiresAt: expiresAt.toISOString() };
}
export async function authorizeTask(request: Request, missionId: string) {
  requireProtectedWorkspace();
  if (!z.uuid().safeParse(missionId).success) throw new TaskError("Task not found.", 404);
  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer jobops_task_[a-f0-9]{64}$/.test(header))
    throw new TaskError("Provide this task's bearer credential.", 401);
  const digest = hashTaskCredential(header.slice(7));
  const [credential] = await db
    .select({ id: taskCredentials.id })
    .from(taskCredentials)
    .where(
      and(
        eq(taskCredentials.missionId, missionId),
        eq(taskCredentials.digest, digest),
        isNull(taskCredentials.revokedAt),
        gt(taskCredentials.expiresAt, new Date()),
      ),
    );
  if (!credential) throw new TaskError("Task credential is invalid, expired or revoked.", 401);
}
