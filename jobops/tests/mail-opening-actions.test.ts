import { beforeEach, expect, it, vi } from "vitest";
import { addJob } from "@/features/jobs/actions";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  importRows: vi.fn(),
  save: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/features/jobs/service", () => ({
  importJobRows: mocks.importRows,
  findImportDuplicates: vi.fn(),
  saveJobMatches: vi.fn(),
}));
vi.mock("@/features/mail/handled", () => ({ saveMailOpening: mocks.save }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
const mailId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
function form(fromMailId?: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    company: "Company",
    title: "SDE II",
    url: "https://example.invalid/job",
    description: "Confirmed job description",
    ...(fromMailId === undefined ? {} : { fromMailId }),
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((callback) => callback("tx"));
  mocks.importRows.mockResolvedValue({ created: 1, merged: 0, skipped: 0, ids: [jobId] });
  mocks.save.mockResolvedValue({ jobId, created: false });
  mocks.redirect.mockImplementation((url) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});
it("rejects an invalid source UUID before importing or writing", async () => {
  expect(await addJob({}, form("bad"))).toMatchObject({
    error: expect.stringContaining("source message"),
  });
  expect(mocks.importRows).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("keeps normal duplicate opening feedback", async () => {
  mocks.importRows.mockResolvedValue({ created: 0, skipped: 1, ids: [jobId] });
  expect(await addJob({}, form())).toEqual({
    error: "This opening is already saved. Open Saved openings to review it.",
  });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("source save uses one transaction and server navigation outside error handling", async () => {
  await expect(addJob({}, form(mailId))).rejects.toThrow("NEXT_REDIRECT:");
  expect(mocks.save).toHaveBeenCalledWith(
    "tx",
    mailId,
    expect.objectContaining({ company: "Company", title: "SDE II" }),
  );
  expect(mocks.importRows).not.toHaveBeenCalled();
  expect(mocks.revalidate.mock.calls.map(([path]) => path)).toContain("/applications");
  expect(mocks.redirect).toHaveBeenCalledWith(`/jobs/${jobId}?savedFromMail=1`);
});

it("failed source handling returns the error without revalidation or navigation", async () => {
  mocks.save.mockRejectedValue(new Error("This message has already been handled."));
  expect(await addJob({}, form(mailId))).toEqual({
    error: "This message has already been handled.",
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("normal new-opening save retains the original destination", async () => {
  expect(await addJob({}, form())).toEqual({ redirect: `/jobs/${jobId}` });
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
