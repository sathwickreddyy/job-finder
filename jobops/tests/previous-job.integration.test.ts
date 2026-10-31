import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  applicationEvents,
  applications,
  companyRecords,
  jobs,
  mailConnections,
  mailMessages,
  mailTracking,
} from "@/db/schema";
import { normalizeCompany } from "@/features/applications/lanes";
import { findApplications } from "@/features/applications/agent-record";
import { addPreviousJob, previousJobs } from "@/features/companies/previous-job";
import { loadMailContext } from "@/features/mail/context";
import { ingestPage } from "@/features/mail/ingest";
import { readWorkspace } from "@/features/workspace/read";
import type { mailClassifications } from "@/db/schema";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `previous-job-${randomUUID()}`;
let counter = 0;
const unique = () => `${prefix.slice(-8)}${++counter}`;

async function company(name: string) {
  const [row] = await db
    .insert(companyRecords)
    .values({ slug: `${prefix}-${++counter}`, name })
    .returning();
  return row;
}
async function email(
  name: string,
  classification: (typeof mailClassifications)[number],
  receivedAt: string,
) {
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${++counter}`,
      provider: "OUTLOOK",
      accountEmail: `${prefix}@fixture.invalid`,
      sender: "hr@fixture.invalid",
      subject: `${classification} ${counter}`,
      receivedAt: new Date(receivedAt),
      classification,
      companyKey: normalizeCompany(name),
      attentionState: "OPEN",
    })
    .returning();
  return row;
}
const jobsByCompany = (name: string) => db.select().from(jobs).where(eq(jobs.company, name));

describe.skipIf(!dbTests)("previous jobs", () => {
  beforeAll(assertE2eDatabase);
  afterEach(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
    const owned = await db
      .select()
      .from(jobs)
      .where(like(jobs.company, `%${prefix.slice(-8)}%`));
    const ids = owned.map((row) => row.id);
    if (ids.length) {
      const apps = await db.select().from(applications).where(inArray(applications.jobId, ids));
      if (apps.length)
        await db.delete(applications).where(
          inArray(
            applications.id,
            apps.map((app) => app.id),
          ),
        );
      await db.delete(jobs).where(inArray(jobs.id, ids));
    }
    await db.delete(companyRecords).where(like(companyRecords.slug, `${prefix}%`));
  });
  afterAll(closeDatabase);

  it("adds a previous employer outside the shortlist", async () => {
    const name = `Amazon ${unique()}`;
    const result = await addPreviousJob({
      company: name,
      role: "SDE I",
      joinedOn: "2022-04",
      leftOn: "2024-01",
      createCompany: true,
    });
    const [created] = await db.select().from(companyRecords).where(eq(companyRecords.name, name));
    expect(created.kind).toBe("PREVIOUS_EMPLOYER");
    const [job] = await jobsByCompany(name);
    expect(job.canonicalUrl).toMatch(/^jobops:previous\//);
    expect(job.source).toBe("PREVIOUS_JOB");
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, result.applicationId));
    expect(app).toMatchObject({
      status: "CLOSED",
      closedReason: "ACCEPTED",
      source: "PREVIOUS_JOB",
      appliedAt: null,
    });
    const [joined] = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, app.id));
    expect(joined).toMatchObject({
      eventType: "JOINED",
      payload: { joinedOn: "2022-04", leftOn: "2024-01" },
    });
    expect((await previousJobs()).find((row) => row.applicationId === app.id)).toEqual({
      applicationId: app.id,
      companyKey: normalizeCompany(name),
      role: "SDE I",
      joinedOn: "2022-04",
      leftOn: "2024-01",
    });
    await db.delete(applicationEvents).where(eq(applicationEvents.applicationId, app.id));
  });

  it("refuses an unknown company unless asked to create it, and a left month before joining", async () => {
    await expect(
      addPreviousJob({ company: `Nobody ${unique()}`, role: "SDE", joinedOn: "2022-04" }),
    ).rejects.toMatchObject({ status: 404 });
    const name = `Weave ${unique()}`;
    await company(name);
    await expect(
      addPreviousJob({ company: name, role: "SDE", joinedOn: "2022-04", leftOn: "2021-12" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("links offer, BGV and joining mail around the joined month", async () => {
    const name = `Amazon ${unique()}`;
    await company(name);
    const offer = await email(name, "OFFER", "2022-02-14T06:00:00Z");
    const bgv = await email(name, "BACKGROUND_CHECK", "2022-03-02T06:00:00Z");
    const joining = await email(name, "ONBOARDING", "2022-05-20T06:00:00Z");
    const interview = await email(name, "INTERVIEW", "2022-01-10T06:00:00Z");
    const late = await email(name, "OFFER", "2022-06-03T06:00:00Z");
    const { applicationId, linked } = await addPreviousJob({
      company: name,
      role: "SDE I",
      joinedOn: "2022-04",
    });
    expect(linked).toBe(3);
    const rows = await db
      .select()
      .from(mailMessages)
      .where(inArray(mailMessages.id, [offer.id, bgv.id, joining.id, interview.id, late.id]));
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of [offer.id, bgv.id, joining.id])
      expect(byId.get(id)).toMatchObject({
        linkedApplicationId: applicationId,
        attentionState: "DONE",
      });
    expect(byId.get(interview.id)?.linkedApplicationId).toBeNull();
    expect(byId.get(late.id)?.linkedApplicationId).toBeNull();
    await db.delete(applicationEvents).where(eq(applicationEvents.applicationId, applicationId));
  });

  it("does not link when the company has an open application", async () => {
    const name = `Oracle ${unique()}`;
    await company(name);
    const [job] = await db
      .insert(jobs)
      .values({
        company: name,
        title: "Senior Engineer",
        canonicalUrl: `https://example.invalid/${prefix}/${counter}`,
        dedupeKey: `${prefix}-${counter}`,
        source: "MANUAL",
      })
      .returning();
    await db.insert(applications).values({ jobId: job.id, status: "APPLIED", source: "DIRECT" });
    await email(name, "OFFER", "2022-03-01T06:00:00Z");
    const { applicationId, linked } = await addPreviousJob({
      company: name,
      role: "MTS",
      joinedOn: "2022-04",
    });
    expect(linked).toBe(0);
    await db.delete(applicationEvents).where(eq(applicationEvents.applicationId, applicationId));
  });

  it("links a later offer email found by a fetch or search", async () => {
    const name = `ServiceNow ${unique()}`;
    await company(name);
    const { applicationId } = await addPreviousJob({
      company: name,
      role: "SE",
      joinedOn: "2023-07",
    });
    const [own] = await db
      .insert(mailConnections)
      .values({
        provider: "OUTLOOK",
        email: `${prefix}-c@fixture.invalid`,
        encryptedAccessToken: "x",
      })
      .returning();
    const context = await loadMailContext();
    const key = normalizeCompany(name);
    const withRule = {
      ...context,
      companies: context.companies.map((row) =>
        row.id === key
          ? { ...row, rule: { ...row.rule, senders: ["offers@servicenow.invalid"] } }
          : row,
      ),
    };
    await db.transaction((tx) =>
      ingestPage(tx, {
        connection: own,
        providerId: "OUTLOOK",
        context: withRule,
        threads: [],
        recoveredBefore: null,
        messages: [
          {
            externalId: `${prefix}-offer`,
            sender: "offers@servicenow.invalid",
            senderName: "People team",
            subject: "Your offer letter",
            bodyText: "We are pleased to offer you the role.",
            receivedAt: "2023-06-20T06:00:00Z",
            folders: ["Inbox"],
          },
        ],
      }),
    );
    const [stored] = await db
      .select()
      .from(mailMessages)
      .where(eq(mailMessages.accountEmail, own.email));
    expect(stored).toMatchObject({ linkedApplicationId: applicationId, attentionState: "DONE" });
    await db.delete(applicationEvents).where(eq(applicationEvents.applicationId, applicationId));
  });

  it("previous jobs never reach Home openings or the duplicate API", async () => {
    const name = `Level AI ${unique()}`;
    const { applicationId } = await addPreviousJob({
      company: name,
      role: "Backend",
      joinedOn: "2021-01",
      createCompany: true,
    });
    const workspace = await readWorkspace();
    expect(workspace.openings.some((row) => row.company === name)).toBe(false);
    expect(workspace.applications.some((row) => row.company === name)).toBe(false);
    expect(await findApplications({ company: name })).toEqual([]);
    await db.delete(applicationEvents).where(eq(applicationEvents.applicationId, applicationId));
  });
});
