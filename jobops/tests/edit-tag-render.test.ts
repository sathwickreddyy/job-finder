import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SnackbarProvider, SnackbarView } from "@/components/snackbar";
import type { MailItem } from "@/features/mail/mail-item";
import { tagLabel, tagsByStage } from "@/features/mail/tags";
import { ConfirmChange, EditTag, TagChoices } from "@/features/timeline/edit-tag";

vi.mock("@/features/mail/workspace-actions", () => ({
  retagMail: vi.fn(),
  restoreMailKind: vi.fn(),
}));

const item = (patch: Partial<MailItem> = {}): MailItem => ({
  id: "m1",
  account: "me@example.com",
  provider: "GMAIL",
  folders: ["INBOX"],
  receivedAt: "2026-10-31T04:00:00.000Z",
  sender: "talent@oracle.example",
  senderName: "Oracle",
  subject: "Update on your application",
  text: "We have decided not to proceed.",
  company: { key: "oracle", name: "Oracle" },
  application: null,
  tag: "application",
  kind: "Application update",
  attention: "open",
  handledAt: null,
  outcome: null,
  ...patch,
});
const confirm = (patch: Partial<Parameters<typeof ConfirmChange>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ConfirmChange, {
      item: item(),
      next: "applicationRejected",
      saving: false,
      onBack: () => {},
      onConfirm: () => {},
      ...patch,
    }),
  );

describe("Edit tag", () => {
  it("step 1 lists eleven tags by stage with meanings and disables the current one", () => {
    const html = renderToStaticMarkup(
      createElement(TagChoices, { current: "application", onPick: () => {} }),
    );
    const positions = tagsByStage.map((tag) => html.indexOf(`>${tagLabel[tag]}<`));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("Turned down before any interview.");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain("· now");
  });

  it("step 2 spells out the change", () => {
    const html = confirm();
    expect(html).toContain("Change this email&#x27;s tag?");
    expect(html).toContain(
      "It moves from Application to Application rejected in the feed, filters and counts.",
    );
    expect(html).toContain("still needs you");
    expect(html).toContain("You can change it again later.");
    expect(html).toContain("Back");
    expect(html).toContain("Yes, change tag");
  });

  it("step 2 says a handled email stays handled", () => {
    const html = confirm({ item: item({ attention: "handled" }) });
    expect(html).toContain("stays handled");
    expect(html).not.toContain("still needs you");
  });

  it("saving shows Saving…", () => {
    expect(confirm({ saving: true })).toContain("Saving…");
    expect(confirm({ error: "Email not found." })).toMatch(
      /role="alert"[^>]*>[^<]*Email not found\./,
    );
  });

  it("a closed pencil adds no dialog to the page", () => {
    const html = renderToStaticMarkup(createElement(EditTag, { item: item() }));
    expect(html).toContain('aria-label="Edit tag"');
    expect(html).not.toContain("<dialog");
  });

  it("the snackbar's polite live region is on the page before any snack", () => {
    // Screen readers announce text added to a live region that already exists.
    const html = renderToStaticMarkup(createElement(SnackbarProvider, null, "page"));
    expect(html).toMatch(
      /<section[^>]*aria-label="Notifications"[^>]*aria-live="polite"[^>]*><\/section>/,
    );
    // Pages keep their own single status message.
    expect(html).not.toContain('role="status"');
  });

  it("snackbar shows its message and action", () => {
    const html = renderToStaticMarkup(
      createElement(SnackbarView, {
        message: "Tagged as Application rejected",
        action: { label: "Undo", onClick: () => {} },
      }),
    );
    expect(html).toContain("Tagged as Application rejected");
    expect(html).toMatch(/<button[^>]*>Undo<\/button>/);
  });
});
