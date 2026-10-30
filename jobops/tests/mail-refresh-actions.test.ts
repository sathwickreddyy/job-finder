import { beforeEach, expect, it, vi } from "vitest";
import { refreshAllInboxes, disconnectInbox } from "@/features/mail/actions";
import { ScanFailure, type ScanResult } from "@/features/mail/scan-service";
const mocks = vi.hoisted(() => ({
  rows: vi.fn(),
  refresh: vi.fn(),
  disconnect: vi.fn(),
  insert: vi.fn(),
  revalidate: vi.fn(),
  context: vi.fn(),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: mocks.rows }) }),
    insert: () => ({ values: mocks.insert }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/services/mail/providers/connections", () => ({
  disconnectConnection: mocks.disconnect,
  accessTokenFor: vi.fn(),
  withConnectionLock: vi.fn(),
}));
vi.mock("@/features/mail/scan-service", async (original) => ({
  ...(await original<object>()),
  scanConnection: mocks.refresh,
}));
vi.mock("@/features/mail/context", () => ({
  loadMailContext: mocks.context,
  ruleKey: vi.fn(),
  ruleSchema: { parse: vi.fn() },
}));
vi.mock("@/features/mail/workspace-read", () => ({ reconcileLegacyMail: vi.fn() }));
const rows = [
  { id: "00000000-0000-4000-8000-000000000001", provider: "GMAIL", email: "a@gmail.com" },
  { id: "00000000-0000-4000-8000-000000000002", provider: "OUTLOOK", email: "b@outlook.in" },
  { id: "00000000-0000-4000-8000-000000000003", provider: "OUTLOOK", email: "c@outlook.com" },
];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rows.mockResolvedValue(rows);
  mocks.context.mockResolvedValue({
    companies: [],
    applications: [],
    outbound: [],
    baselineAt: "2026-10-30T00:00:00Z",
  });
  mocks.refresh.mockResolvedValue({
    scanned: 1,
    arrived: 1,
    historical: 0,
    excluded: 0,
    more: false,
  });
});
it("refreshes every account even when Outlook is revoked", async () => {
  mocks.refresh.mockImplementation(async (row) => {
    if (row.id === rows[1].id) throw new Error("Outlook access expired. Reconnect Outlook.");
    return { scanned: 1, arrived: 1, historical: 0, excluded: 0, more: false };
  });
  const result = await refreshAllInboxes({});
  expect(result).toMatchObject({
    success: expect.stringContaining("2 of 3 accounts checked. 2 new updates"),
    mailRefresh: { arrived: 2 },
  });
  expect(result.success).toContain("b@outlook.in");
});
it("retains partial committed imports when saving error status also failed", async () => {
  mocks.refresh.mockImplementation(async (row) => {
    if (row.id === rows[1].id)
      throw new ScanFailure("Outlook access expired. Reconnect Outlook.", {
        scanned: 3,
        arrived: 2,
        historical: 0,
        excluded: 1,
        more: true,
      });
    return { scanned: 1, arrived: 1, historical: 0, excluded: 0, more: false };
  });
  expect(await refreshAllInboxes({})).toMatchObject({
    success: expect.stringContaining("4 new updates"),
    mailRefresh: { arrived: 4 },
  });
});
it("returns all inbox errors when every account fails", async () => {
  mocks.refresh.mockRejectedValue(new Error("Access expired. Reconnect."));
  const result = await refreshAllInboxes({});
  expect(result.error).toContain("0 of 3 accounts checked.");
  for (const row of rows) expect(result.error).toContain(row.email);
  expect(result.mailRefresh?.arrived).toBe(0);
});
it("starts all inboxes independently before waiting on a slow one", async () => {
  let release!: (value: ScanResult) => void;
  const slow = new Promise<ScanResult>((done) => {
    release = done;
  });
  const started: string[] = [];
  mocks.refresh.mockImplementation((row) => {
    started.push(row.id);
    return row.id === rows[0].id
      ? slow
      : Promise.resolve({ scanned: 1, arrived: 1, historical: 0, excluded: 0, more: false });
  });
  const result = refreshAllInboxes({});
  await vi.waitFor(() => expect(started).toEqual(rows.map((row) => row.id)));
  release({ scanned: 1, arrived: 1, historical: 0, excluded: 0, more: false });
  expect((await result).mailRefresh?.arrived).toBe(3);
});
it("asks to connect before attempting an empty refresh", async () => {
  mocks.rows.mockResolvedValue([]);
  expect(await refreshAllInboxes({})).toEqual({
    error: "Connect an inbox before checking mail.",
  });
});
it("disconnects through the shared service and explains external grant removal", async () => {
  mocks.disconnect.mockResolvedValue(rows[1]);
  const form = new FormData();
  form.set("connectionId", rows[1].id);
  expect(await disconnectInbox({}, form)).toMatchObject({
    success: expect.stringContaining("Google or Microsoft account permissions"),
  });
  expect(mocks.disconnect).toHaveBeenCalledWith(rows[1].id);
});
