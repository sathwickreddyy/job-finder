import { expect, test } from "@playwright/test";
import { createTask, decideTask, proposeTask } from "../../src/features/tasks/mutations";
import { issueTaskCredential } from "../../src/features/tasks/credentials";
import { closeDatabase, db } from "../../src/db";
import {
  applications,
  jobs,
  missions,
  resumes,
  resumeVersions,
  taskCredentials,
} from "../../src/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { uploadResumeVersion } from "../../src/features/resumes/service";
import { importJobRows } from "../../src/features/jobs/service";

test.skip(
  !process.env.JOBOPS_E2E_ACCESS_TOKEN,
  "Run this suite with JOBOPS_E2E_ACCESS_TOKEN to verify the protected API boundary.",
);

test.afterAll(async () => {
  await closeDatabase();
});
test("scoped API binds retries and execution to a human-approved latest proposal", async ({
  request,
}) => {
  expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/jobops_e2e");
  const task = await createTask({
    kind: "SHOWCASE",
    title: "Test portfolio draft",
    goal: "Prepare my project case study for review before publishing.",
    assistant: "Claude",
    context: "Use only real project facts.",
  });
  const other = await createTask({
    kind: "CUSTOM",
    title: "Other private task",
    goal: "Discuss my preferences with me before proposing changes.",
    assistant: "ChatGPT",
    context: "Private other context",
  });
  const credential = await issueTaskCredential(task.id);
  const headers = { authorization: `Bearer ${credential.token}` };
  const url = `/api/v1/tasks/${task.id}`;
  expect((await request.get(`/tasks/${task.id}`, { headers, maxRedirects: 0 })).status()).toBe(307);
  expect(
    (
      await request.post(`/tasks/${task.id}`, {
        headers: { ...headers, origin: "http://127.0.0.1:3211", "next-action": "forged" },
        data: {},
        maxRedirects: 0,
      })
    ).status(),
  ).toBe(307);
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.get(`/api/v1/tasks/${other.id}`, { headers })).status()).toBe(401);
  const context = await request.get(url, { headers });
  expect(context.status()).toBe(200);
  expect((await context.json()).preferences).toBe("Use only real project facts.");
  expect((await context.json()).apiGuide.proposalSchema).toHaveProperty("properties.payload");
  expect(
    (
      await request.get(`${url}/resume?versionId=00000000-0000-4000-8000-000000000101`, { headers })
    ).status(),
  ).toBe(403);
  const proposal = {
    requestId: "draft-1",
    summary: "Proposed case study",
    payload: {
      kind: "SHOWCASE",
      title: "Case study",
      targetUrl: "https://example.invalid/portfolio",
      content: "A truthful case study based on my own work.",
    },
  };
  expect(
    (
      await request.post(`${url}/proposals`, { headers, data: { ...proposal, approved: true } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`${url}/proposals`, {
        headers: { ...headers, origin: "https://evil.example" },
        data: proposal,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${url}/proposals`, {
        headers: { ...headers, "next-action": "forged" },
        data: proposal,
      })
    ).status(),
  ).toBe(403);
  const posted = await request.post(`${url}/proposals`, { headers, data: proposal });
  expect(posted.status()).toBe(201);
  const first = await posted.json();
  expect(
    (await (await request.post(`${url}/proposals`, { headers, data: proposal })).json()).id,
  ).toBe(first.id);
  expect(
    (
      await request.post(`${url}/proposals`, {
        headers,
        data: { ...proposal, summary: "Different content" },
      })
    ).status(),
  ).toBe(409);
  const report = {
    requestId: "execution-1",
    status: "EXECUTED",
    summary: "Published the approved draft",
    proposalId: first.id,
    evidenceUrl: "https://example.invalid/published",
  };
  expect((await request.post(`${url}/updates`, { headers, data: report })).status()).toBe(409);
  await decideTask(task.id, { proposalId: first.id, decision: "APPROVE", feedback: "" });
  const revised = await request.post(`${url}/proposals`, {
    headers,
    data: { ...proposal, requestId: "draft-2", summary: "Revised case study" },
  });
  const second = await revised.json();
  expect((await request.post(`${url}/updates`, { headers, data: report })).status()).toBe(409);
  await decideTask(task.id, {
    proposalId: second.id,
    decision: "APPROVE",
    feedback: "Checked this exact revision",
  });
  const done = await request.post(`${url}/updates`, {
    headers,
    data: { ...report, proposalId: second.id },
  });
  expect(done.status()).toBe(200);
  const repeated = await request.post(`${url}/updates`, {
    headers,
    data: { ...report, proposalId: second.id },
  });
  expect((await repeated.json()).id).toBe((await done.json()).id);
  expect((await (await request.get(url, { headers })).json()).task.status).toBe("COMPLETED");
  const replacement = await issueTaskCredential(task.id);
  expect((await request.get(url, { headers })).status()).toBe(401);
  expect(
    (
      await request.get(url, { headers: { authorization: `Bearer ${replacement.token}` } })
    ).status(),
  ).toBe(200);
});

test("concurrent credential replacement leaves only one usable task credential", async ({
  request,
}) => {
  const task = await createTask({
    kind: "CUSTOM",
    title: "Credential race",
    goal: "Review this fictional concurrency test.",
    assistant: "Codex",
    context: "",
  });
  const credentials = await Promise.all([
    issueTaskCredential(task.id),
    issueTaskCredential(task.id),
  ]);
  const responses = await Promise.all(
    credentials.map((c) =>
      request.get(`/api/v1/tasks/${task.id}`, { headers: { authorization: `Bearer ${c.token}` } }),
    ),
  );
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 401]);
  const active = await db
    .select()
    .from(taskCredentials)
    .where(and(eq(taskCredentials.missionId, task.id), isNull(taskCredentials.revokedAt)));
  expect(active).toHaveLength(1);
});

test("resume upload retries preserve one draft and approval explicitly switches versions", async ({
  request,
}) => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Fictional API test resume");
  const buffer = Buffer.from(await doc.save());
  const [family] = await db
    .insert(resumes)
    .values({ name: "API revision test", slug: `api-revision-${Date.now()}` })
    .returning();
  const original = await uploadResumeVersion({
    resumeId: family.id,
    versionLabel: "Original",
    makeCurrent: true,
    file: new File([buffer], "original.pdf", { type: "application/pdf" }),
  });
  const task = await createTask({
    kind: "TAILOR",
    title: "Review a resume draft",
    goal: "Revise the fictional resume with me.",
    assistant: "Codex",
    context: "",
    resumeVersionId: original.id,
  });
  const { token } = await issueTaskCredential(task.id);
  const headers = { authorization: `Bearer ${token}` },
    url = `/api/v1/tasks/${task.id}`;
  const multipart = {
    requestId: "upload-1",
    label: "Revised",
    file: { name: "draft.pdf", mimeType: "application/pdf", buffer },
  };
  const uploads = await Promise.all([
    request.post(`${url}/resume`, { headers, multipart }),
    request.post(`${url}/resume`, { headers, multipart }),
  ]);
  expect(uploads.map((r) => r.status())).toEqual([201, 201]);
  const draft = await uploads[0].json();
  expect((await uploads[1].json()).versionId).toBe(draft.versionId);
  expect(
    (
      await request.post(`${url}/resume`, {
        headers,
        multipart: { ...multipart, label: "Different" },
      })
    ).status(),
  ).toBe(409);
  let versions = await db
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, family.id));
  expect(versions).toHaveLength(2);
  expect(versions.find((v) => v.isCurrent)?.id).toBe(original.id);
  const posted = await request.post(`${url}/proposals`, {
    headers,
    data: {
      requestId: "review-1",
      summary: "Review revised resume",
      payload: {
        kind: "RESUME",
        versionId: draft.versionId,
        changes: "Describe real changes here.",
      },
    },
  });
  expect(posted.status()).toBe(201);
  await decideTask(task.id, {
    proposalId: (await posted.json()).id,
    decision: "APPROVE",
    feedback: "Reviewed",
  });
  versions = await db.select().from(resumeVersions).where(eq(resumeVersions.resumeId, family.id));
  expect(versions.find((v) => v.isCurrent)?.id).toBe(draft.versionId);
  expect((await request.get(`${url}/resume?versionId=${original.id}`, { headers })).status()).toBe(
    200,
  );
});

test("revised application approvals reuse one tracked application", async ({ request }) => {
  const result = await importJobRows(
    [
      {
        company: "API fictional company",
        title: `API role ${Date.now()}`,
        location: "Bengaluru, India",
        url: `https://example.invalid/api-job-${Date.now()}`,
        source: "MANUAL",
        description: "Fictional test only",
        notes: "",
        workMode: "ONSITE",
        employmentType: "FULL_TIME",
        requirements: [],
      },
    ],
    "skip",
  );
  const jobId = result.ids[0];
  const [version] = await db
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.isCurrent, true))
    .limit(1);
  const task = await createTask({
    kind: "APPLY",
    title: "Application revisions",
    goal: "Prepare an application for review.",
    assistant: "Codex",
    context: "",
    jobId,
    resumeVersionId: version.id,
  });
  const { token } = await issueTaskCredential(task.id);
  const headers = { authorization: `Bearer ${token}` },
    url = `/api/v1/tasks/${task.id}`;
  const proposal = {
    requestId: "draft-1",
    summary: "Prepare application",
    payload: {
      kind: "APPLICATION",
      jobId,
      resumeVersionId: version.id,
      targetUrl: "https://example.invalid/application",
      answers: { city: "Bengaluru" },
      questions: [],
    },
  };
  const first = await (await request.post(`${url}/proposals`, { headers, data: proposal })).json();
  const approved = await decideTask(task.id, {
    proposalId: first.id,
    decision: "APPROVE",
    feedback: "",
  });
  const concurrent = await Promise.all(
    [2, 3].map((n) =>
      request.post(`${url}/proposals`, {
        headers,
        data: { ...proposal, requestId: `draft-${n}`, summary: `Revised application ${n}` },
      }),
    ),
  );
  expect(concurrent.map((r) => r.status())).toEqual([201, 201]);
  const context = await (await request.get(url, { headers })).json();
  const latest = context.proposals[0],
    older = context.proposals[1];
  await expect(
    decideTask(task.id, { proposalId: older.id, decision: "APPROVE", feedback: "" }),
  ).rejects.toThrow("newer proposal");
  const revised = await decideTask(task.id, {
    proposalId: latest.id,
    decision: "APPROVE",
    feedback: "",
  });
  expect(revised.effects.applicationId).toBe(approved.effects.applicationId);
  expect(await db.select().from(applications).where(eq(applications.jobId, jobId))).toHaveLength(1);
  await db
    .update(applications)
    .set({ applicationUrl: "https://example.invalid/changed" })
    .where(eq(applications.id, String(revised.effects.applicationId)));
  expect(
    (
      await request.post(`${url}/updates`, {
        headers,
        data: {
          requestId: "execution-1",
          status: "EXECUTED",
          proposalId: latest.id,
          summary: "Submitted the approved test application",
        },
      })
    ).status(),
  ).toBe(409);
  await db
    .update(applications)
    .set({ applicationUrl: proposal.payload.targetUrl, status: "TECHNICAL_INTERVIEW" })
    .where(eq(applications.id, String(revised.effects.applicationId)));
  const executed = await request.post(`${url}/updates`, {
    headers,
    data: {
      requestId: "execution-1",
      status: "EXECUTED",
      proposalId: latest.id,
      summary: "Submitted the approved test application",
    },
  });
  expect(executed.status()).toBe(200);
  const [application] = await db.select().from(applications).where(eq(applications.jobId, jobId));
  expect(application.status).toBe("TECHNICAL_INTERVIEW");
  expect((await db.select().from(jobs).where(eq(jobs.id, jobId)))[0].status).toBe("APPLIED");

  const followup = await createTask({
    kind: "APPLY",
    title: "State guard check",
    goal: "Prepare an application for review.",
    assistant: "Codex",
    context: "",
    jobId,
    resumeVersionId: version.id,
  });
  const prepared = await proposeTask(followup.id, proposal);
  const decision = await decideTask(followup.id, {
    proposalId: prepared.id,
    decision: "APPROVE",
    feedback: "",
  });
  await db
    .update(applications)
    .set({ status: "APPLIED" })
    .where(eq(applications.id, String(decision.effects.applicationId)));
  const newer = await proposeTask(followup.id, { ...proposal, requestId: "second-preparation" });
  await expect(
    decideTask(followup.id, { proposalId: newer.id, decision: "APPROVE", feedback: "" }),
  ).rejects.toThrow("beyond preparation");
});

test("closed task decisions cannot bypass task review", async () => {
  const task = await createTask({
    kind: "CUSTOM",
    title: "Closed-task review",
    goal: "Review this fictional result first.",
    assistant: "Codex",
    context: "",
  });
  const proposal = await proposeTask(task.id, {
    requestId: "one",
    summary: "Ready to review",
    payload: { kind: "NOTE", content: "A fictional test result" },
  });
  await db.update(missions).set({ status: "CANCELLED" }).where(eq(missions.id, task.id));
  await expect(
    decideTask(task.id, { proposalId: proposal.id, decision: "APPROVE", feedback: "" }),
  ).rejects.toThrow("closed");
});

test("public unlock endpoints reject a real approval server-action request", async ({
  page,
  request,
}) => {
  const task = await createTask({
    kind: "CUSTOM",
    title: "Approval boundary",
    goal: "Review this fictional result first.",
    assistant: "Codex",
    context: "",
  });
  await proposeTask(task.id, {
    requestId: "one",
    summary: "Ready to review",
    payload: { kind: "NOTE", content: "This result must remain unapproved." },
  });
  await page.request.post("/api/unlock", {
    headers: { origin: "http://127.0.0.1:3211" },
    form: { token: process.env.JOBOPS_E2E_ACCESS_TOKEN! },
  });
  await page.goto(`/tasks/${task.id}`);
  let capture!: (data: { headers: Record<string, string>; body: Buffer }) => void;
  const captured = new Promise<{ headers: Record<string, string>; body: Buffer }>((resolve) => {
    capture = resolve;
  });
  await page.route(`**/tasks/${task.id}`, async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      capture({ headers: req.headers(), body: req.postDataBuffer()! });
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Accept this result", exact: true }).click();
  const action = await captured;
  expect(action.headers["next-action"]).toBeTruthy();
  const headers = {
    origin: "http://127.0.0.1:3211",
    "next-action": action.headers["next-action"],
    "content-type": action.headers["content-type"],
  };
  expect(
    (await request.post("/unlock", { headers, data: action.body, maxRedirects: 0 })).status(),
  ).toBe(405);
  expect(
    (await request.post("/api/unlock", { headers, data: action.body, maxRedirects: 0 })).status(),
  ).toBe(403);
  expect((await db.select().from(missions).where(eq(missions.id, task.id)))[0].status).toBe(
    "READY_FOR_REVIEW",
  );
});
