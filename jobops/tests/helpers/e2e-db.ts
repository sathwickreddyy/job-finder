import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/** Set by `npm run test:db`, which points DATABASE_URL at the marked jobops_e2e database. */
export const dbTests = process.env.MAIL_DB_TEST === "1";

export async function assertE2eDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Refusing any database other than jobops_e2e");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Test ownership marker required");
}
