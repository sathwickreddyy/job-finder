import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

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
