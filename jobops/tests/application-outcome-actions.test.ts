import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordOutcome } from "@/features/applications/outcomes";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  applyOutcome: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/features/applications/outcome-service", () => ({ applyOutcome: mocks.applyOutcome }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
  mocks.transaction.mockImplementation(async (callback) => callback({}));
  mocks.applyOutcome.mockResolvedValue({ eventId: "event", roundId: null, company: "Company" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

function form(values: Record<string, string | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) data.set(key, value);
  return data;
}

it("records a simple outcome when optional controls submit empty strings", async () => {
  const result = await recordOutcome(
    {},
    form({ id, outcome: "heard", kind: "", day: "", time: "", happenedOn: "" }),
  );
  expect(result).toEqual({ success: "Saved: Heard back.", redirect: `/applications/${id}` });
  expect(mocks.applyOutcome).toHaveBeenCalledWith(
    {},
    {
      applicationId: id,
      outcome: "heard",
      detail: { kind: undefined, at: undefined, name: "", note: "", happenedAt: new Date() },
    },
    new Date(),
  );
  expect(mocks.revalidate.mock.calls.map(([path]) => path)).toContain("/companies");
});

it("rejects an invalid timestamp or untimed interview before opening a transaction", async () => {
  for (const values of [
    { outcome: "heard", happenedOn: "2026-10-04" },
    { outcome: "scheduled", kind: "DSA", day: "2026-10-10", time: "" },
    { outcome: "scheduled", kind: "DSA", day: "2026-02-30", time: "10:00" },
  ]) {
    expect(await recordOutcome({}, form({ id, ...values }))).toHaveProperty("error");
  }
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
