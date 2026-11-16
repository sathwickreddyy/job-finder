import { revalidatePath } from "next/cache";

/** Pages that show interview questions. */
export function revalidateQuestions(applicationId?: string) {
  revalidatePath("/applications");
  revalidatePath("/applications/questions");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}
