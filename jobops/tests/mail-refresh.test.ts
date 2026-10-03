import { expect, it } from "vitest";
import { summarizeRefresh } from "@/features/mail/refresh-summary";
import { MailRefreshError } from "@/features/mail/refresh-service";
const ok = (imported: number, more = false) => ({
  status: "fulfilled" as const,
  value: { imported, duplicates: 0, more },
});
const failed = (reason: Error) => ({ status: "rejected" as const, reason });
it("reports actual arrivals across inboxes", () => {
  expect(
    summarizeRefresh([
      { email: "a@gmail.com", result: ok(2) },
      { email: "b@outlook.in", result: ok(1) },
    ]),
  ).toMatchObject({ success: "Refreshed 2 of 2 inboxes · 3 new.", mailRefresh: { arrived: 3 } });
});
it("retains committed arrivals even when a failed inbox could not save error status", () => {
  const result = summarizeRefresh([
    { email: "a@gmail.com", result: ok(2) },
    {
      email: "b@outlook.in",
      result: failed(
        new MailRefreshError(
          "Outlook access expired. Reconnect Outlook.",
          { imported: 1, duplicates: 0, more: true },
          false,
        ),
      ),
    },
  ]);
  expect(result).toMatchObject({
    success:
      "Refreshed 1 of 2 inboxes · 3 new. More messages remain; refresh again to continue. Needs attention: b@outlook.in: Outlook access expired. Reconnect Outlook.",
    mailRefresh: { arrived: 3 },
  });
});
it("all failed refreshes still expose committed partial arrivals", () => {
  const result = summarizeRefresh([
    {
      email: "a@gmail.com",
      result: failed(
        new MailRefreshError(
          "Gmail rate limit reached.",
          { imported: 2, duplicates: 0, more: true },
          true,
        ),
      ),
    },
  ]);
  expect(result).toMatchObject({
    error: expect.stringContaining("No inbox refreshed. 2 new messages saved."),
    mailRefresh: { arrived: 2 },
  });
});
it("ordinary failures never manufacture arrivals", () => {
  expect(
    summarizeRefresh([
      { email: "a@gmail.com", result: failed(new Error("Gmail rate limit reached.")) },
    ]),
  ).toMatchObject({
    error: "No inbox refreshed. a@gmail.com: Gmail rate limit reached.",
    mailRefresh: { arrived: 0 },
  });
});
