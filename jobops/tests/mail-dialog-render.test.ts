import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MailItem } from "@/features/mail/mail-item";

vi.mock("@/features/mail/workspace-actions", () => ({
  handleMailAction: vi.fn(),
  reopenMailAction: vi.fn(),
  placeMailAction: vi.fn(),
  retagMail: vi.fn(),
  restoreMailKind: vi.fn(),
  undoAutoOutcomeAction: vi.fn(),
}));
vi.mock("@/features/mail/read-actions", () => ({ readMailForDialog: vi.fn() }));
const { MailDialog, linkify } = await import("@/features/mail/mail-dialog");

const item = (patch: Partial<MailItem> = {}): MailItem => ({
  id: "m1",
  account: "me@example.com",
  provider: "GMAIL",
  folders: ["INBOX"],
  receivedAt: "2026-11-16T04:00:00.000Z",
  sender: "talent@servicenow.test",
  senderName: "ServiceNow Talent",
  subject: "Interview confirmation",
  text: "Hello",
  company: { key: "servicenow", name: "ServiceNow" },
  application: null,
  tag: "interviewCall",
  kind: "Interview",
  attention: "handled",
  handledAt: null,
  outcome: null,
  ...patch,
});
type DialogProps = Parameters<typeof MailDialog>[0];
const render = (_: typeof MailDialog, props: DialogProps) =>
  renderToStaticMarkup(createElement(MailDialog, props));

describe("linkify", () => {
  it("links a URL and leaves trailing punctuation outside", () => {
    const html = renderToStaticMarkup(
      createElement("p", null, ...linkify("See https://a.test/x.")),
    );
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toContain('href="https://a.test/x"');
    expect(anchors[0]).toContain('target="_blank"');
    expect(anchors[0]).toContain('rel="noreferrer"');
    expect(html).toContain("https://a.test/x</a>.");
  });

  it("leaves text without URLs alone and ignores non-http schemes", () => {
    const html = renderToStaticMarkup(
      createElement("p", null, ...linkify("Call me. javascript:alert(1)")),
    );
    expect(html).not.toContain("<a ");
  });
});

describe("MailDialog", () => {
  it("shows the email as text, never as HTML", () => {
    const html = render(MailDialog, {
      item: item({ text: "<b>hi</b>" }),
      onClose: () => {},
      footer: null,
    });
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).not.toContain("<b>hi</b>");
  });

  it("names the subject, sender and inbox and labels the dialog by the subject", () => {
    const html = render(MailDialog, { item: item(), onClose: () => {}, footer: null });
    expect(html).toContain("Interview confirmation");
    expect(html).toContain("ServiceNow Talent");
    expect(html).toContain("talent@servicenow.test");
    expect(html).toMatch(/<dialog[^>]*aria-labelledby="([^"]+)"/);
  });

  it("offers previous and next only when given", () => {
    const none = render(MailDialog, { item: item(), onClose: () => {}, footer: null });
    expect(none).not.toContain('aria-label="Next email"');
    const both = render(MailDialog, {
      item: item(),
      onClose: () => {},
      onPrev: () => {},
      onNext: () => {},
      footer: null,
    });
    expect(both).toContain('aria-label="Next email"');
    expect(both).toContain('aria-label="Previous email"');
  });
});
