"use server";

import { ApiError } from "@/features/agent-api/http";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { addQuestions, deleteQuestion, updateQuestion } from "./questions";
import { revalidateQuestions } from "./revalidate";

export type QuestionActionState = ActionState & { id?: string };

/** The question fields a form sends; absent fields are left out so an update keeps them. */
function fieldsFrom(form: FormData) {
  const fields: Record<string, unknown> = {};
  // The review is written by agents through the API; the editor never sends it.
  for (const key of ["title", "prompt", "answer", "interviewer", "time", "space"])
    if (form.has(key)) fields[key] = String(form.get(key));
  if (form.has("patterns")) {
    const patterns = formString(form, "patterns");
    fields.patterns = patterns ? (JSON.parse(patterns) as unknown) : [];
  }
  if (form.has("outcome")) fields.outcome = formString(form, "outcome") || null;
  return fields;
}

function failure(error: unknown): QuestionActionState {
  if (error instanceof ApiError) {
    const issues = error.details?.issues as { path: string; message: string }[] | undefined;
    return {
      error: issues?.length ? issues.map((issue) => issue.message).join(" ") : error.message,
    };
  }
  return actionError(error);
}

/** Adds a question to its round, or updates it when the form carries its id. */
export async function saveQuestion(
  _state: QuestionActionState,
  form: FormData,
): Promise<QuestionActionState> {
  try {
    const applicationId = formString(form, "applicationId");
    const id = formString(form, "id");
    const fields = fieldsFrom(form);
    if (id) {
      await updateQuestion(id, fields);
      revalidateQuestions(applicationId || undefined);
      return { success: "Question saved.", id };
    }
    const [created] = await addQuestions(applicationId, formString(form, "roundId"), [fields]);
    revalidateQuestions(applicationId);
    return { success: "Question saved.", id: created };
  } catch (error) {
    return failure(error);
  }
}

export async function removeQuestion(
  _state: QuestionActionState,
  form: FormData,
): Promise<QuestionActionState> {
  try {
    await deleteQuestion(formString(form, "id"));
    revalidateQuestions(formString(form, "applicationId") || undefined);
    return { success: "Question deleted." };
  } catch (error) {
    return failure(error);
  }
}
