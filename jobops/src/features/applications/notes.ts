import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";

export const NOTES_MAX = 100_000;

/** Replaces an application's Markdown notes; the notes editor and the notes API both save here. */
export async function writeApplicationNotes(id: string, notes: string): Promise<string> {
  if (notes.length > NOTES_MAX) throw new ApiError("Notes are too long to save.", 400);
  const saved = await db
    .update(applications)
    .set({ notes, updatedAt: new Date() })
    .where(eq(applications.id, id))
    .returning({ notes: applications.notes });
  if (!saved.length) throw new ApiError("Application not found.", 404);
  return saved[0].notes;
}
