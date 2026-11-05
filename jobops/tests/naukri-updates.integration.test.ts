import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { settings } from "@/db/schema";
import {
  NAUKRI_KEY,
  naukriUpdateSchema,
  readNaukriStatus,
  recordNaukriUpdate,
} from "@/features/workspace/naukri-updates";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const now = new Date("2026-11-04T04:00:00Z");
const input = (patch: Record<string, unknown> = {}) =>
  naukriUpdateSchema.parse({
    action: "saved_resume_headline_unchanged",
    evidence: "Profile last updated - Today",
    verified: true,
    ...patch,
  });
const clear = () => db.delete(settings).where(eq(settings.key, NAUKRI_KEY));

describe.skipIf(!dbTests)("Naukri update records", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    await clear();
  });
  afterAll(async () => {
    await assertE2eDatabase();
    await clear();
    await closeDatabase();
  });

  it("starts with nothing recorded", async () => {
    expect((await readNaukriStatus(now)).tone).toBe("none");
  });

  it("records today by default and keeps a day that is already recorded", async () => {
    const first = await recordNaukriUpdate(input(), now);
    expect(first).toMatchObject({ tone: "fresh", doneInWindow: 1 });
    const again = await recordNaukriUpdate(input({ evidence: "A second observation" }), now);
    expect(again.doneInWindow).toBe(1);
    const [row] = await db.select().from(settings).where(eq(settings.key, NAUKRI_KEY));
    expect((row!.value.updates as { evidence: string }[])[0]!.evidence).toBe(
      "Profile last updated - Today",
    );
  });

  it("backfills an earlier verified day and refuses a future one", async () => {
    const status = await recordNaukriUpdate(input({ indiaDate: "2026-11-03" }), now);
    expect(status.doneInWindow).toBe(2);
    await expect(recordNaukriUpdate(input({ indiaDate: "2026-11-05" }), now)).rejects.toThrow(
      /future/,
    );
  });

  it("requires the update to have been verified on Naukri", () => {
    expect(() => naukriUpdateSchema.parse({ action: "x", evidence: "y" })).toThrow();
    expect(() =>
      naukriUpdateSchema.parse({ action: "x", evidence: "y", verified: false }),
    ).toThrow();
  });
});
