import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { TriageMessage } from "@/features/mail/read";
import { EmailsPanel } from "@/features/applications/views/mail-sections";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/mail/triage-actions", () => ({
  dismissMail: vi.fn(),
  linkMailOnly: vi.fn(),
  undoDismiss: vi.fn(),
}));

const message = (patch: Partial<TriageMessage>): TriageMessage => ({
  id: crypto.randomUUID(),
  subject: "Subject",
  sender: "talent@example.invalid",
  senderName: "Talent",
  receivedAt: new Date("2026-10-02T10:00:00+05:30"),
  classification: "UNKNOWN",
  bucket: "noise",
  record: null,
  snippet: "",
  accountEmail: "me@gmail.com",
  ...patch,
});

it("lists only mail that is not on a lane, with one action per kind", () => {
  const html = renderToStaticMarkup(
    createElement(EmailsPanel, {
      data: {
        messages: [
          message({
            subject: "Matched OA",
            classification: "ASSESSMENT",
            bucket: "updates",
            record: { id: "r1", company: "Zscaler", role: "SDE" },
          }),
          message({
            subject: "Unmatched interview",
            classification: "INTERVIEW",
            bucket: "updates",
          }),
          message({
            subject: "InMobi pitch",
            classification: "RECRUITER_OUTREACH",
            bucket: "roles",
          }),
          message({ subject: "12 new jobs", sender: "jobalerts@naukri.com" }),
          message({ subject: "We received it", classification: "APPLICATION_ACKNOWLEDGEMENT" }),
        ],
        handled: 3,
        lastDismissedId: null,
        lastDismissalToken: null,
      },
      records: [{ id: "r1", label: "Zscaler · SDE" }],
      inboxes: createElement("p", null, "INBOXES"),
      notice: "Dismissed 1 message.",
      accountIndex: { "me@gmail.com": 0 },
    }),
  );
  expect(html).not.toContain("Matched OA");
  expect(html).toContain("Replies we couldn&#x27;t match");
  expect(html).toContain("Unmatched interview");
  expect(html).toContain("Record for this message");
  expect(html).toContain('href="/jobs/new?fromMail=');
  expect(html).toContain("Job alerts and auto-replies");
  expect(html).toContain("Clear all");
  expect(html).toContain("3 handled");
  expect(html).toContain('href="/mail/import"');
  expect(html).toContain("INBOXES");
  expect(html).toContain("Dismissed 1 message.");
});
