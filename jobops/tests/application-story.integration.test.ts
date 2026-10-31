import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  applicationEvents,
  applications,
  companyRecords,
  jobs,
  mailEvents,
  mailMessages,
} from "@/db/schema";
import { readApplications } from "@/features/applications/read";
import { readApplicationStory } from "@/features/applications/story";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `app-story-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const name = `Story ${prefix}`;
const key = name.toLowerCase();
const ids = { jobs: [] as string[], companies: [] as string[], apps: [] as string[] };
const NOW = new Date("2026-11-01T10:30:00+05:30");
let counter = 0;

async function application(title: string) {
  counter++;
  const [job] = await db
    .insert(jobs)
    .values({
      company: name,
      title,
      canonicalUrl: `https://fixture.invalid/${prefix}/${counter}`,
      dedupeKey: `${prefix}-${counter}`,
      source: "MANUAL",
      status: "APPLIED",
    })
    .returning();
  ids.jobs.push(job.id);
  const [app] = await db
    .insert(applications)
    .values({
      jobId: job.id,
      source: "DIRECT",
      status: "APPLIED",
      appliedAt: new Date("2026-10-20T05:00:00Z"),
    })
    .returning();
  ids.apps.push(app.id);
  await db.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: "APPLICATION_SUBMITTED",
    occurredAt: new Date("2026-10-20T05:00:00Z"),
    summary: "Human confirmed final submission",
  });
  return app;
}
async function email(subject: string, receivedAt: string, linkedApplicationId: string | null) {
  counter++;
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject,
      receivedAt: new Date(receivedAt),
      classification: "FOLLOW_UP",
      companyKey: key,
      linkedApplicationId,
      attentionState: linkedApplicationId ? "DONE" : "OPEN",
    })
    .returning();
  await db.insert(mailEvents).values({ mailMessageId: row.id, type: "FOLLOW_UP", confidence: 0.9 });
  return row;
}

describe.skipIf(!dbTests)("application story", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    const [company] = await db.insert(companyRecords).values({ slug: prefix, name }).returning();
    ids.companies.push(company.id);
  });
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    if (ids.jobs.length) {
      await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
      await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    }
    if (ids.companies.length)
      await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("story keeps linked mail and newer unlinked company mail", async () => {
    const mine = await application("Backend Engineer");
    const sibling = await application("Platform Engineer");
    const linked = await email("Linked to mine", "2026-10-22T05:00:00Z", mine.id);
    const newer = await email("Unlinked and newer", "2026-10-25T05:00:00Z", null);
    await email("Unlinked and older", "2026-10-01T05:00:00Z", null);
    await email("Linked to the sibling", "2026-10-26T05:00:00Z", sibling.id);
    const { records } = await readApplications();
    const record = records.find((item) => item.id === mine.id)!;
    const siblings = records.filter((item) => item.companyKey === record.companyKey);
    const story = await readApplicationStory(record, siblings, NOW);
    const subjects = story.days.flatMap((day) =>
      day.entries.flatMap((entry) => (entry.type === "mail" ? [entry.item.subject] : [])),
    );
    expect(subjects).toEqual(["Unlinked and newer", "Linked to mine"]);
    expect(
      story.days.flatMap((day) =>
        day.entries.flatMap((entry) => (entry.type === "step" ? [entry.eventType] : [])),
      ),
    ).toContain("APPLICATION_SUBMITTED");
    expect(Object.keys(story.handling)).toEqual([newer.id]);
    expect(story.handling[newer.id]).toMatchObject({ chosen: null });
    expect(story.handling[linked.id]).toBeUndefined();
  });
});
