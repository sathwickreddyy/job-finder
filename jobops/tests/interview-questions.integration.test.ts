import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { applicationRounds, applications, interviewQuestions, jobs } from "@/db/schema";
import {
  addQuestions,
  deleteQuestion,
  listRoundQuestions,
  readLibrary,
  updateQuestion,
} from "@/features/interviews/questions";
import { ApiError } from "@/features/agent-api/http";
import { removeQuestion, saveQuestion } from "@/features/interviews/actions";
import { GET as getApplicationQuestions } from "@/app/api/v1/applications/[id]/questions/route";
import { POST as postRoundQuestions } from "@/app/api/v1/applications/[id]/rounds/[roundId]/questions/route";
import { GET as getLibrary } from "@/app/api/v1/questions/route";
import { PATCH as patchQuestion } from "@/app/api/v1/questions/[id]/route";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const json = (body: unknown, method = "POST") =>
  new Request("http://127.0.0.1:3210/api", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const prefix = `questions-${randomUUID()}`;
const company = `Questions ${prefix}`;
const jobIds: string[] = [];
let counter = 0;

async function seed(title: string) {
  counter++;
  const [job] = await db
    .insert(jobs)
    .values({
      company,
      title,
      canonicalUrl: `https://fixture.invalid/${prefix}/${counter}`,
      dedupeKey: `${prefix}-${counter}`,
      source: "MANUAL",
      status: "APPLIED",
    })
    .returning();
  jobIds.push(job.id);
  const [app] = await db
    .insert(applications)
    .values({
      jobId: job.id,
      source: "DIRECT",
      status: "TECHNICAL_INTERVIEW",
      appliedAt: new Date("2026-10-20T05:00:00Z"),
    })
    .returning();
  const rounds = await db
    .insert(applicationRounds)
    .values([
      {
        applicationId: app.id,
        kind: "DSA",
        position: 1,
        outcome: "PASSED",
        scheduledAt: new Date("2026-11-10T06:30:00Z"),
      },
      {
        applicationId: app.id,
        kind: "LLD",
        position: 2,
        scheduledAt: new Date("2026-11-16T06:30:00Z"),
      },
    ])
    .returning();
  return { app, rounds };
}

const expectStatus = async (promise: Promise<unknown>, status: number) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
};

describe.skipIf(!dbTests)("interview questions", () => {
  let first: Awaited<ReturnType<typeof seed>>;
  let other: Awaited<ReturnType<typeof seed>>;

  beforeAll(async () => {
    await assertE2eDatabase();
    first = await seed("Senior engineer");
    other = await seed("Staff engineer");
  });

  afterAll(async () => {
    await assertE2eDatabase();
    if (jobIds.length) {
      await db.delete(applications).where(inArray(applications.jobId, jobIds));
      await db.delete(jobs).where(inArray(jobs.id, jobIds));
    }
    await closeDatabase();
  });

  it("appends questions at the next positions", async () => {
    const [round1, round2] = first.rounds;
    const ids = await addQuestions(first.app.id, round2.id, [
      {
        title: "Longest substring without repeating characters",
        patterns: ["Sliding window", "Hash map"],
      },
      {
        title: "Product of array except self",
        patterns: ["Prefix product"],
        outcome: "solved_code",
      },
    ]);
    expect(ids).toHaveLength(2);
    const rows = await db
      .select()
      .from(interviewQuestions)
      .where(inArray(interviewQuestions.id, ids));
    expect(rows.map((r) => r.position).sort()).toEqual([1, 2]);
    const [third] = await addQuestions(first.app.id, round2.id, [
      { title: "Minimum window substring" },
    ]);
    const [row] = await db
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.id, third));
    expect(row.position).toBe(3);
    await addQuestions(first.app.id, round1.id, [{ title: "Two sum", patterns: ["Hash map"] }]);

    const listed = await listRoundQuestions(first.app.id);
    expect(listed.map((r) => r.label)).toEqual(["Round 1 · DSA", "Round 2 · LLD"]);
    expect(listed[1].questions.map((q) => q.position)).toEqual([1, 2, 3]);
    expect(listed[1].questions[1].outcome).toBe("solved_code");
  });

  it("refuses a round from another application and unknown ids", async () => {
    await expectStatus(addQuestions(first.app.id, other.rounds[0].id, [{ title: "Q" }]), 409);
    await expectStatus(addQuestions(randomUUID(), first.rounds[0].id, [{ title: "Q" }]), 404);
    await expectStatus(addQuestions(first.app.id, randomUUID(), [{ title: "Q" }]), 404);
    await expectStatus(addQuestions(first.app.id, first.rounds[0].id, [{ title: "" }]), 400);
    await expectStatus(updateQuestion(randomUUID(), { title: "Q" }), 404);
  });

  it("stamps reviewedAt when a review is written", async () => {
    const [id] = await addQuestions(other.app.id, other.rounds[0].id, [{ title: "Window review" }]);
    const updated = await updateQuestion(id, { review: "r", reviewSource: "Claude Code" });
    expect(updated.review).toBe("r");
    expect(updated.reviewSource).toBe("Claude Code");
    expect(updated.reviewedAt).not.toBeNull();
    await expectStatus(updateQuestion(id, { review: "again", reviewSource: null }), 400);
    const kept = await updateQuestion(id, { answer: "my working" });
    expect(kept.review).toBe("r");
  });

  it("searches and filters the library, newest round first", async () => {
    const found = await readLibrary({ company: prefix, q: "window" });
    expect(found.rows.map((r) => r.title)).toEqual(
      expect.arrayContaining([
        "Longest substring without repeating characters",
        "Minimum window substring",
        "Window review",
      ]),
    );
    const hash = await readLibrary({ company: prefix, pattern: "hash map" });
    expect(hash.rows.map((r) => r.title).sort()).toEqual([
      "Longest substring without repeating characters",
      "Two sum",
    ]);
    const all = await readLibrary({ company: prefix });
    const dates = all.rows.map((r) => r.date ?? "");
    expect(dates).toEqual([...dates].sort().reverse());
    expect(all.rows.at(-1)?.roundLabel).toBe("Round 1 · DSA");

    const page = await readLibrary({ company: prefix, limit: 2 });
    expect(page.rows).toHaveLength(2);
    const next = await readLibrary({ company: prefix, limit: 10, cursor: page.nextCursor! });
    expect([...page.rows, ...next.rows].map((r) => r.id)).toEqual(all.rows.map((r) => r.id));
  });

  it("round-trips questions through the agent routes", async () => {
    const app = other.app.id;
    const roundId = other.rounds[1].id;
    const params = Promise.resolve({ id: app, roundId });
    const created = await postRoundQuestions(
      json({ questions: [{ title: "Route question", patterns: ["Graphs"], outcome: "partial" }] }),
      { params },
    );
    expect(created.status).toBe(201);
    const { ids } = (await created.json()) as { ids: string[] };
    expect(ids).toHaveLength(1);

    const read = await getApplicationQuestions(new Request("http://127.0.0.1:3210/api"), {
      params: Promise.resolve({ id: app }),
    });
    const { rounds } = (await read.json()) as {
      rounds: { id: string; questions: { id: string; outcome: string }[] }[];
    };
    const round = rounds.find((r) => r.id === roundId)!;
    expect(round.questions.find((q) => q.id === ids[0])?.outcome).toBe("partial");

    const patched = await patchQuestion(json({ answer: "BFS from each node" }, "PATCH"), {
      params: Promise.resolve({ id: ids[0] }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { question: { answer: string } }).question.answer).toBe(
      "BFS from each node",
    );

    const library = await getLibrary(
      new Request(
        `http://127.0.0.1:3210/api/v1/questions?company=${encodeURIComponent(prefix)}&pattern=graphs`,
      ),
    );
    expect(((await library.json()) as { rows: { id: string }[] }).rows.map((r) => r.id)).toEqual(
      ids,
    );
  });

  it("returns 404 and 400 from the agent routes", async () => {
    const missing = await patchQuestion(json({ title: "x" }, "PATCH"), {
      params: Promise.resolve({ id: randomUUID() }),
    });
    expect(missing.status).toBe(404);
    const empty = await postRoundQuestions(json({ questions: [] }), {
      params: Promise.resolve({ id: other.app.id, roundId: other.rounds[1].id }),
    });
    expect(empty.status).toBe(400);
    const tooMany = await postRoundQuestions(
      json({ questions: Array.from({ length: 21 }, (_, i) => ({ title: `Q${i}` })) }),
      { params: Promise.resolve({ id: other.app.id, roundId: other.rounds[1].id }) },
    );
    expect(tooMany.status).toBe(400);
    const badOutcome = await getLibrary(
      new Request("http://127.0.0.1:3210/api/v1/questions?outcome=SOLVED"),
    );
    expect(badOutcome.status).toBe(400);
  });

  it("saves from the editor once, then updates the same question", async () => {
    const form = (fields: Record<string, string>) => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      return data;
    };
    const base = { applicationId: other.app.id, roundId: other.rounds[0].id };
    const created = await saveQuestion(
      {},
      form({
        ...base,
        title: "Editor question",
        patterns: JSON.stringify(["Two pointers"]),
        outcome: "solved_aloud",
        answer: "first draft",
        review: "sneaky",
        reviewSource: "Me",
      }),
    );
    expect(created.error).toBeUndefined();
    expect(created.id).toBeTruthy();
    const again = await saveQuestion(
      {},
      form({
        ...base,
        id: created.id!,
        title: "Editor question",
        answer: "second draft",
        outcome: "",
      }),
    );
    expect(again.error).toBeUndefined();
    expect(again.id).toBe(created.id);
    const rows = await db
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.title, "Editor question"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      answer: "second draft",
      outcome: null,
      review: "",
      reviewSource: null,
    });
    expect(rows[0].patterns).toEqual(["Two pointers"]);

    const removed = await removeQuestion({}, form({ id: created.id! }));
    expect(removed.error).toBeUndefined();
    expect(
      await db.select().from(interviewQuestions).where(eq(interviewQuestions.id, created.id!)),
    ).toEqual([]);
  });

  it("deletes questions one by one and with their round", async () => {
    const [id] = await addQuestions(other.app.id, other.rounds[1].id, [{ title: "Doomed" }]);
    await deleteQuestion(id);
    expect(await db.select().from(interviewQuestions).where(eq(interviewQuestions.id, id))).toEqual(
      [],
    );
    await expectStatus(deleteQuestion(id), 404);

    const roundId = first.rounds[0].id;
    await db.delete(applicationRounds).where(eq(applicationRounds.id, roundId));
    expect(
      await db.select().from(interviewQuestions).where(eq(interviewQuestions.roundId, roundId)),
    ).toEqual([]);
  });
});
