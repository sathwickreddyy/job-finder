import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { applications, jobs, mailMessages, mailTracking } from "@/db/schema";
import { readMailView } from "@/features/timeline/mail-data";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `mail-view-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const name = `View ${prefix}`;
const key = name.toLowerCase();
const now = new Date("2026-10-31T10:00:00+05:30");
const jobIds: string[] = [];
let counter = 0;
async function email(patch: Partial<typeof mailMessages.$inferInsert> = {}) {
  counter++;
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: `View ${counter}`,
      receivedAt: new Date(Date.UTC(2026, 8, 1, 0, counter)),
      classification: "FOLLOW_UP",
      attentionState: "DONE",
      companyKey: key,
      ...patch,
    })
    .returning();
  return row;
}
const mailIds = (data: Awaited<ReturnType<typeof readMailView>>) =>
  data.pane.kind === "empty"
    ? []
    : data.pane.days.flatMap((day) =>
        day.entries.flatMap((entry) => (entry.type === "mail" ? [entry.item.id] : [])),
      );

describe.skipIf(!dbTests)("the Mail view", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    const [job] = await db
      .insert(jobs)
      .values({
        company: name,
        title: "Backend",
        canonicalUrl: `https://fixture.invalid/${prefix}`,
        dedupeKey: prefix,
        source: "MANUAL",
        status: "APPLIED",
      })
      .returning();
    jobIds.push(job.id);
    await db
      .insert(applications)
      .values({ jobId: job.id, source: "DIRECT", status: "APPLIED", appliedAt: now });
  });
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(applications).where(inArray(applications.jobId, jobIds));
    await db.delete(jobs).where(inArray(jobs.id, jobIds));
    await closeDatabase();
  });

  it("opens an older email named in the URL at its page", async () => {
    const oldest = await email({ subject: `Oldest ${prefix}` });
    for (let index = 0; index < 52; index++) await email();
    const view = await readMailView({ company: name, mail: oldest.id }, now);
    expect(view.pane.kind).toBe("company");
    expect(mailIds(view)).toContain(oldest.id);
    expect(view.pane.kind === "company" && view.pane.newestHref).toBeTruthy();
    expect(view.query.mail).toBe(oldest.id);
  });

  it("names the shown company in the query and says the URL did not", async () => {
    const view = await readMailView({ company: name }, now);
    expect(view).toMatchObject({ pinned: true, query: { company: key } });
    const landing = await readMailView({}, now);
    expect(landing.pinned).toBe(false);
    expect(landing.pane.kind).toBe("all");
    expect(landing.query).toMatchObject({ company: null, all: true });
    expect((await readMailView({ view: "all" }, now)).pinned).toBe(true);
  });

  it("shows a search over unplaced mail in All job mail", async () => {
    const word = `homeonly${randomUUID().slice(0, 8)}`;
    const unplaced = await email({
      companyKey: null,
      subject: `Unplaced ${word}`,
      attentionState: "OPEN",
    });
    const view = await readMailView({ q: word }, now);
    expect(view.index.rows).toEqual([]);
    expect(view.pane.kind).toBe("all");
    expect(mailIds(view)).toEqual([unplaced.id]);
  });

  it("All job mail lists every kept email newest first and never excluded mail", async () => {
    const word = `feed${randomUUID().slice(0, 8)}`;
    const older = await email({
      subject: `${word} older`,
      receivedAt: new Date("2026-10-29T05:00:00Z"),
    });
    const unplaced = await email({
      subject: `${word} unplaced`,
      companyKey: null,
      receivedAt: new Date("2026-10-30T05:00:00Z"),
    });
    const newer = await email({
      subject: `${word} newer`,
      receivedAt: new Date("2026-10-31T03:00:00Z"),
    });
    const hidden = await email({
      subject: `${word} hidden`,
      receivedAt: new Date("2026-10-31T04:00:00Z"),
    });
    await db.insert(mailTracking).values({
      provider: "GMAIL",
      accountEmail: account,
      providerMessageId: `${prefix}-hidden`,
      messageId: hidden.id,
      sender: hidden.sender,
      subject: hidden.subject,
      receivedAt: hidden.receivedAt,
      disposition: "excluded",
    });
    const view = await readMailView({ view: "all", q: word }, now);
    expect(view.pane.kind).toBe("all");
    expect(mailIds(view)).toEqual([newer.id, unplaced.id, older.id]);
  });

  it("All job mail suggests the outcome for the email's company role", async () => {
    const word = `suggest${randomUUID().slice(0, 8)}`;
    const invite = await email({
      subject: `${word} interview invitation`,
      classification: "INTERVIEW",
      attentionState: "OPEN",
      receivedAt: new Date("2026-10-31T02:00:00Z"),
    });
    const view = await readMailView({ view: "all", q: word }, now);
    expect(view.pane.kind).toBe("all");
    const handling = view.pane.kind === "all" ? view.pane.handling[invite.id] : undefined;
    expect(handling?.suggested).toBe("scheduled");
  });
});
