import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  markRecordSent: vi.fn(),
  linkMailToRecord: vi.fn(),
  dismissMessages: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/applications/outcome-service", () => ({
  markRecordSent: mocks.markRecordSent,
  updateRecordDetails: vi.fn(),
  updateRecordRound: vi.fn(),
}));
vi.mock("@/features/mail/handling-service", () => ({
  linkMailToRecord: mocks.linkMailToRecord,
  dismissMessages: mocks.dismissMessages,
  restoreDismissal: vi.fn(),
  unlinkMailFromRecord: vi.fn(),
}));

import { recordAsSent } from "@/features/applications/record-actions";
import { dismissMail, linkMailOnly } from "@/features/mail/triage-actions";

const recordId = "00000000-0000-4000-8000-000000000001";
const mailId = "00000000-0000-4000-8000-000000000002";
const lane = `/applications?open=${recordId}`;
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
beforeEach(() => {
  mocks.transaction.mockImplementation(async (callback) => callback({}));
  mocks.linkMailToRecord.mockResolvedValue(true);
});
afterEach(() => vi.resetAllMocks());

it("returns to the lane after recording a record as sent, and to the record otherwise", async () => {
  expect(
    await recordAsSent(
      {},
      form({ id: recordId, sentDate: "2026-10-02", humanConfirmed: "on", returnTo: lane }),
    ),
  ).toEqual({ success: "Recorded as sent.", redirect: lane });
  expect(
    await recordAsSent(
      {},
      form({ id: recordId, sentDate: "", humanConfirmed: "on", returnTo: "//evil.example" }),
    ),
  ).toEqual({ success: "Recorded as sent.", redirect: `/applications/${recordId}` });
});

it("links mail and returns to the lane with the notice", async () => {
  await linkMailOnly({}, form({ mailId, recordId, returnTo: lane }));
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/applications?open=${recordId}&notice=Message+linked+to+your+record.`,
  );
});

it("dismisses from a lane and returns there", async () => {
  mocks.dismissMessages.mockResolvedValue(1);
  await dismissMail({}, form({ mailId, returnTo: lane }));
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/applications?open=${recordId}&notice=Dismissed+1+message.`,
  );
});

it("returns to the Emails drawer when dismissing without a lane", async () => {
  mocks.dismissMessages.mockResolvedValue(1);
  await dismissMail({}, form({ mailId }));
  expect(mocks.redirect).toHaveBeenCalledWith(
    "/applications?emails=1&notice=Dismissed%201%20message.",
  );
});
