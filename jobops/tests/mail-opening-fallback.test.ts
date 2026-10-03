import { beforeEach, expect, it, vi } from "vitest";
import { jobInputSchema } from "@/features/jobs/import";
import { saveMailOpening } from "@/features/mail/handled";
import type { MailTx } from "@/features/mail/handling-service";
const mocks = vi.hoisted(() => ({
  importRows: vi.fn(),
  lockMail: vi.fn(),
  requireOpenMail: vi.fn(),
  markMailHandled: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/features/jobs/service", () => ({ importJobRows: mocks.importRows }));
vi.mock("@/features/mail/handling-service", () => ({
  lockMail: mocks.lockMail,
  requireOpenMail: mocks.requireOpenMail,
  markMailHandled: mocks.markMailHandled,
}));
const mailId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const data = jobInputSchema.parse({
  company: "Company",
  title: "SDE II",
  url: "https://example.invalid/job?utm_source=email",
  description: "Role",
});
function executor(matches: { id: string }[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => matches,
          for: async () => [{ id: jobId, notes: "Original" }],
        }),
      }),
    }),
  } as unknown as MailTx;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.importRows.mockResolvedValue({ created: 0, skipped: 1, ids: [] });
  mocks.lockMail.mockResolvedValue({
    message: { attentionState: "DONE", linkedApplicationId: null },
    events: [{ status: "REVIEWED", linkedApplicationId: null, details: { savedOpeningId: jobId } }],
  });
});
it("resolves canonical/dedupe identity when skip returns no ID and safely repeats an already saved source", async () => {
  const tx = executor([{ id: jobId }]);
  expect(await saveMailOpening(tx, mailId, data)).toEqual({
    jobId,
    created: false,
    handled: false,
  });
  expect(mocks.importRows).toHaveBeenCalledWith([data], "skip", tx);
  expect(mocks.requireOpenMail).not.toHaveBeenCalled();
  expect(mocks.markMailHandled).not.toHaveBeenCalled();
});
it("fails usefully when skip has no ID and no existing opening", async () => {
  await expect(saveMailOpening(executor([]), mailId, data)).rejects.toThrow(
    "could not be saved or found",
  );
  expect(mocks.lockMail).not.toHaveBeenCalled();
});
it("rejects ambiguous canonical/dedupe identities before handling source mail", async () => {
  await expect(
    saveMailOpening(executor([{ id: jobId }, { id: mailId }]), mailId, data),
  ).rejects.toThrow("identity conflict");
  expect(mocks.lockMail).not.toHaveBeenCalled();
});
