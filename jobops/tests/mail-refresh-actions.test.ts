import { beforeEach, expect, it, vi } from "vitest";
import { refreshAllInboxes, disconnectInbox } from "@/features/mail/actions";
import { ApiError } from "@/features/agent-api/http";
import type { AccountCheck, CheckResult } from "@/features/mail/check-service";
const mocks = vi.hoisted(() => ({
  step: vi.fn(),
  disconnect: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/services/mail/providers/connections", () => ({
  disconnectConnection: mocks.disconnect,
}));
vi.mock("@/features/mail/check-service", () => ({ checkMailStep: mocks.step }));
const account = (email: string, patch: Partial<AccountCheck> = {}): AccountCheck => ({
  account: email,
  provider: "OUTLOOK",
  status: "done",
  error: null,
  lastFetchedAt: "2026-10-30T10:00:00.000Z",
  ...patch,
});
const step = (patch: Partial<CheckResult> = {}): CheckResult => ({
  more: false,
  newAttention: 1,
  accounts: [account("a@gmail.com"), account("b@outlook.in"), account("c@outlook.com")],
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.step.mockResolvedValue(step());
});
it("summarizes every inbox even when Outlook is revoked", async () => {
  mocks.step.mockResolvedValue(
    step({
      newAttention: 2,
      accounts: [
        account("a@gmail.com"),
        account("b@outlook.in", { status: "failed", error: "Outlook access expired." }),
        account("c@outlook.com"),
      ],
    }),
  );
  const result = await refreshAllInboxes();
  expect(result).toMatchObject({
    success: expect.stringContaining("2 new need attention. Checked 2 of 3 inboxes."),
    mailRefresh: { arrived: 2 },
  });
  expect(result.success).toContain("Reconnect b@outlook.in (Outlook access expired.)");
});
it("keeps stepping while more mail remains, at most four steps", async () => {
  mocks.step.mockResolvedValue(step({ more: true }));
  const result = await refreshAllInboxes();
  expect(mocks.step).toHaveBeenCalledTimes(4);
  expect(result.mailRefresh?.arrived).toBe(4);
  expect(result.success).toContain("More mail remains");
});
it("stops as soon as the window completes", async () => {
  mocks.step
    .mockResolvedValueOnce(step({ more: true, newAttention: 2 }))
    .mockResolvedValueOnce(step({ newAttention: 0 }));
  expect((await refreshAllInboxes()).mailRefresh?.arrived).toBe(2);
  expect(mocks.step).toHaveBeenCalledTimes(2);
});
it("returns all inbox errors when every account fails", async () => {
  mocks.step.mockResolvedValue(
    step({
      newAttention: 0,
      accounts: ["a@gmail.com", "b@outlook.in", "c@outlook.com"].map((email) =>
        account(email, { status: "failed", error: "Access expired." }),
      ),
    }),
  );
  const result = await refreshAllInboxes();
  expect(result.error).toContain("No inbox checked.");
  for (const email of ["a@gmail.com", "b@outlook.in", "c@outlook.com"])
    expect(result.error).toContain(email);
  expect(result.mailRefresh?.arrived).toBe(0);
});
it("asks to connect before attempting an empty refresh", async () => {
  mocks.step.mockImplementation(async () => {
    throw new ApiError("Connect an inbox before checking mail.", 409);
  });
  expect(await refreshAllInboxes()).toEqual({
    error: "Connect an inbox before checking mail.",
  });
});
it("disconnects through the shared service and explains external grant removal", async () => {
  mocks.disconnect.mockResolvedValue({ email: "b@outlook.in" });
  const form = new FormData();
  form.set("connectionId", "00000000-0000-4000-8000-000000000002");
  expect(await disconnectInbox({}, form)).toMatchObject({
    success: expect.stringContaining("Google or Microsoft account permissions"),
  });
  expect(mocks.disconnect).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
});
