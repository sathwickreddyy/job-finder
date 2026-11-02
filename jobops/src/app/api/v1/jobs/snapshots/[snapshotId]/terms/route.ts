import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { jobSnapshots } from "@/db/schema";
import { ApiError, apiError, apiResponse, readJson } from "@/features/agent-api/http";
import { getTermList, reviewedTermsSchema, saveTermList } from "@/features/resumes/score/terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ snapshotId: string }> };

async function snapshotOf({ params }: Params) {
  const id = z.uuid().safeParse((await params).snapshotId);
  const [snapshot] = id.success
    ? await db.select().from(jobSnapshots).where(eq(jobSnapshots.id, id.data))
    : [];
  if (!snapshot) throw new ApiError("Unknown job description.", 404);
  return snapshot;
}

/** The reviewed term list for this saved description, or null when nobody reviewed it. */
export async function GET(_request: Request, context: Params) {
  try {
    const snapshot = await snapshotOf(context);
    return apiResponse({ list: await getTermList(snapshot.id) });
  } catch (error) {
    return apiError(error);
  }
}

/** Saves the user's confirmed terms; every later score of this description uses them. */
export async function PUT(request: Request, context: Params) {
  try {
    const snapshot = await snapshotOf(context);
    const { terms } = z
      .strictObject({ terms: reviewedTermsSchema })
      .parse(await readJson(request, 256 * 1024));
    if (terms.some((t) => !snapshot.description.includes(t.jdQuote)))
      throw new ApiError("A term's quote isn't in the saved description.", 422);
    const result = await saveTermList(snapshot.id, terms, "user");
    revalidatePath("/resumes");
    return apiResponse(result);
  } catch (error) {
    return apiError(error);
  }
}
