import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  QUESTION_TEXT_MAX,
  applicationRounds,
  applications,
  interviewQuestions,
  jobs,
  type questionOutcomes,
} from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { roundLabels } from "@/features/applications/round-label";
import {
  questionOutcomeValues,
  type InterviewQuestion,
  type LibraryRow,
  type QuestionOutcome,
  type RoundWithQuestions,
} from "./types";

const markdown = z.string().max(QUESTION_TEXT_MAX);
const patterns = z
  .array(z.string().trim().min(1).max(60))
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((p) => {
      const key = p.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .pipe(z.array(z.string()).max(8, "Use at most 8 patterns."));

/** Fields an interview question accepts; none carries a default, so patches change only what they name. */
export const questionFields = z.strictObject({
  title: z.string().trim().min(1, "Give the question a title.").max(200),
  patterns: patterns.optional(),
  prompt: markdown.optional(),
  answer: markdown.optional(),
  outcome: z.enum(questionOutcomeValues).nullable().optional(),
  time: z.string().trim().max(200).optional(),
  space: z.string().trim().max(200).optional(),
  interviewer: markdown.optional(),
  review: markdown.optional(),
  reviewSource: z.string().trim().min(1).max(100).nullable().optional(),
});

/** A review always says who wrote it. */
export function reviewHasSource(value: { review?: string; reviewSource?: string | null }) {
  return !value.review?.trim() || !!value.reviewSource?.trim();
}
const reviewSourceIssue = {
  message: "Say who wrote the review in reviewSource.",
  path: ["reviewSource"],
};

export const questionInput = questionFields.refine(reviewHasSource, reviewSourceIssue);
export const questionPatch = questionFields.partial();
export type QuestionInput = z.infer<typeof questionInput>;
export type QuestionPatch = z.infer<typeof questionPatch>;

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

type QuestionRow = typeof interviewQuestions.$inferSelect;
type DbOutcome = (typeof questionOutcomes)[number];

const toDb = (outcome: QuestionOutcome | null | undefined): DbOutcome | null | undefined =>
  outcome === undefined
    ? undefined
    : outcome === null
      ? null
      : (outcome.toUpperCase() as DbOutcome);
const fromDb = (outcome: DbOutcome | null): QuestionOutcome | null =>
  outcome ? (outcome.toLowerCase() as QuestionOutcome) : null;

function toQuestion(row: QuestionRow): InterviewQuestion {
  return {
    id: row.id,
    roundId: row.roundId,
    position: row.position,
    title: row.title,
    patterns: row.patterns,
    prompt: row.prompt,
    answer: row.answer,
    outcome: fromDb(row.outcome),
    time: row.timeComplexity,
    space: row.spaceComplexity,
    interviewer: row.interviewer,
    review: row.review,
    reviewSource: row.reviewSource,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ApiError("Invalid question.", 400, {
    issues: result.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
  });
}

/** Column values a parsed input or patch sets; absent fields are left out. */
function columns(input: QuestionPatch) {
  const values: Partial<typeof interviewQuestions.$inferInsert> = {};
  if (input.title !== undefined) values.title = input.title;
  if (input.patterns !== undefined) values.patterns = input.patterns;
  if (input.prompt !== undefined) values.prompt = input.prompt;
  if (input.answer !== undefined) values.answer = input.answer;
  if (input.outcome !== undefined) values.outcome = toDb(input.outcome);
  if (input.time !== undefined) values.timeComplexity = input.time;
  if (input.space !== undefined) values.spaceComplexity = input.space;
  if (input.interviewer !== undefined) values.interviewer = input.interviewer;
  if (input.review !== undefined) values.review = input.review;
  if (input.reviewSource !== undefined) values.reviewSource = input.reviewSource;
  return values;
}

async function requireApplication(applicationId: string) {
  if (!uuidPattern.test(applicationId)) throw new ApiError("Application not found.", 404);
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId));
  if (!app) throw new ApiError("Application not found.", 404);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The application's rounds in position order, each with its questions. */
export async function listRoundQuestions(applicationId: string): Promise<RoundWithQuestions[]> {
  await requireApplication(applicationId);
  const rounds = await db
    .select()
    .from(applicationRounds)
    .where(eq(applicationRounds.applicationId, applicationId))
    .orderBy(asc(applicationRounds.position));
  const questions = rounds.length
    ? await db
        .select()
        .from(interviewQuestions)
        .where(
          inArray(
            interviewQuestions.roundId,
            rounds.map((r) => r.id),
          ),
        )
        .orderBy(asc(interviewQuestions.position))
    : [];
  const labels = roundLabels(rounds);
  return rounds.map((round, index) => ({
    id: round.id,
    position: round.position,
    kind: round.kind,
    name: round.name,
    label: labels[index],
    scheduledAt: round.scheduledAt?.toISOString() ?? null,
    outcome: round.outcome,
    questions: questions.filter((q) => q.roundId === round.id).map(toQuestion),
  }));
}

/** Appends questions after the round's last one, in one transaction; returns their ids in order. */
export async function addQuestions(
  applicationId: string,
  roundId: string,
  inputs: unknown[],
): Promise<string[]> {
  await requireApplication(applicationId);
  if (!uuidPattern.test(roundId)) throw new ApiError("Round not found.", 404);
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 20)
    throw new ApiError("Send between 1 and 20 questions.", 400);
  const parsed = inputs.map((input) => parse(questionInput, input));
  return db.transaction(async (tx) => {
    const [round] = await tx
      .select({ applicationId: applicationRounds.applicationId })
      .from(applicationRounds)
      .where(eq(applicationRounds.id, roundId))
      .for("update");
    if (!round) throw new ApiError("Round not found.", 404);
    if (round.applicationId !== applicationId)
      throw new ApiError("This round belongs to a different application.", 409);
    const [{ last }] = await tx
      .select({ last: sql<number>`coalesce(max(${interviewQuestions.position}), 0)::int` })
      .from(interviewQuestions)
      .where(eq(interviewQuestions.roundId, roundId));
    const now = new Date();
    const rows = await tx
      .insert(interviewQuestions)
      .values(
        parsed.map((input, index) => ({
          ...columns(input),
          title: input.title,
          roundId,
          position: last + index + 1,
          reviewedAt: input.review?.trim() ? now : null,
        })),
      )
      .returning({ id: interviewQuestions.id, position: interviewQuestions.position });
    return rows.sort((a, b) => a.position - b.position).map((r) => r.id);
  });
}

/** Changes only the named fields; writing a review stamps `reviewedAt`. */
export async function updateQuestion(id: string, patch: unknown): Promise<InterviewQuestion> {
  if (!uuidPattern.test(id)) throw new ApiError("Question not found.", 404);
  const input = parse(questionPatch, patch);
  const [current] = await db.select().from(interviewQuestions).where(eq(interviewQuestions.id, id));
  if (!current) throw new ApiError("Question not found.", 404);
  const merged = {
    review: input.review ?? current.review,
    reviewSource: input.reviewSource !== undefined ? input.reviewSource : current.reviewSource,
  };
  if (!reviewHasSource(merged))
    throw new ApiError("Invalid question.", 400, {
      issues: [{ path: reviewSourceIssue.path.join("."), message: reviewSourceIssue.message }],
    });
  const values = columns(input);
  if (input.review !== undefined && input.review !== current.review)
    values.reviewedAt = input.review.trim() ? new Date() : null;
  const [row] = await db
    .update(interviewQuestions)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(interviewQuestions.id, id))
    .returning();
  if (!row) throw new ApiError("Question not found.", 404);
  return toQuestion(row);
}

export async function deleteQuestion(id: string): Promise<void> {
  if (!uuidPattern.test(id)) throw new ApiError("Question not found.", 404);
  const removed = await db
    .delete(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .returning({ id: interviewQuestions.id });
  if (!removed.length) throw new ApiError("Question not found.", 404);
}

export const libraryQuery = z.strictObject({
  q: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  pattern: z.string().trim().max(60).optional(),
  outcome: z.enum(questionOutcomeValues).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().max(200).optional(),
});
export type LibraryQuery = z.input<typeof libraryQuery>;

const encodeCursor = (date: string, id: string) =>
  Buffer.from(JSON.stringify([date, id])).toString("base64url");
function decodeCursor(cursor: string): [string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      !Number.isNaN(Date.parse(value[0])) &&
      typeof value[1] === "string" &&
      uuidPattern.test(value[1])
    )
      return [value[0], value[1]];
  } catch {}
  throw new ApiError("Invalid cursor.", 400);
}

const like = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Every recorded question across applications, newest round first. The date is the round's
 * booked time, or the question's creation time for an unbooked round.
 */
export async function readLibrary(
  query: LibraryQuery = {},
): Promise<{ rows: LibraryRow[]; nextCursor: string | null }> {
  const { q, company, pattern, outcome, limit = 100, cursor } = parse(libraryQuery, query);
  const sortDate = sql<Date>`date_trunc('milliseconds', coalesce(${applicationRounds.scheduledAt}, ${interviewQuestions.createdAt}))`;
  const filters: SQL[] = [];
  if (q)
    filters.push(
      or(
        ilike(interviewQuestions.title, like(q)),
        ilike(jobs.company, like(q)),
        ilike(applicationRounds.name, like(q)),
        sql`${applicationRounds.kind}::text ilike ${like(q)}`,
        sql`${interviewQuestions.patterns}::text ilike ${like(q)}`,
      )!,
    );
  if (company) filters.push(ilike(jobs.company, like(company)));
  if (pattern)
    filters.push(
      sql`exists (select 1 from jsonb_array_elements_text(${interviewQuestions.patterns}) p where lower(p) = lower(${pattern}))`,
    );
  if (outcome) filters.push(eq(interviewQuestions.outcome, toDb(outcome)!));
  if (cursor) {
    const [date, id] = decodeCursor(cursor);
    filters.push(
      sql`(${sortDate} < ${date}::timestamptz or (${sortDate} = ${date}::timestamptz and ${interviewQuestions.id} < ${id}::uuid))`,
    );
  }
  const rows = await db
    .select({
      question: interviewQuestions,
      applicationId: applicationRounds.applicationId,
      company: jobs.company,
      role: jobs.title,
      date: sortDate,
    })
    .from(interviewQuestions)
    .innerJoin(applicationRounds, eq(applicationRounds.id, interviewQuestions.roundId))
    .innerJoin(applications, eq(applications.id, applicationRounds.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(sortDate), desc(interviewQuestions.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const appIds = [...new Set(page.map((r) => r.applicationId))];
  const siblings = appIds.length
    ? await db
        .select({
          id: applicationRounds.id,
          applicationId: applicationRounds.applicationId,
          kind: applicationRounds.kind,
          outcome: applicationRounds.outcome,
        })
        .from(applicationRounds)
        .where(inArray(applicationRounds.applicationId, appIds))
        .orderBy(asc(applicationRounds.position))
    : [];
  const labels = new Map<string, string>();
  for (const appId of appIds) {
    const own = siblings.filter((r) => r.applicationId === appId);
    roundLabels(own).forEach((label, index) => labels.set(own[index].id, label));
  }
  const iso = (value: Date | string) => new Date(value).toISOString();
  const last = page.at(-1);
  return {
    rows: page.map((r) => ({
      ...toQuestion(r.question),
      applicationId: r.applicationId,
      company: r.company,
      role: r.role,
      roundLabel: labels.get(r.question.roundId) ?? "",
      date: iso(r.date),
    })),
    nextCursor: rows.length > limit && last ? encodeCursor(iso(last.date), last.question.id) : null,
  };
}
