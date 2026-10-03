import { expect, it } from "vitest";
import { mailIsOpen, mailCanUndoDismiss } from "@/features/mail/state";
const message = { attentionState: "OPEN", linkedApplicationId: null };
const event = { status: "NEEDS_REVIEW", linkedApplicationId: null, details: {} };
it("requires an unlinked review event and preserves legacy DONE", () => {
  expect(mailIsOpen(message, [event])).toBe(true);
  expect(mailIsOpen({ ...message, attentionState: "DONE" }, [event])).toBe(false);
  expect(mailIsOpen(message, [])).toBe(false);
  expect(mailIsOpen(message, [{ ...event, status: "REVIEWED" }])).toBe(false);
  expect(mailIsOpen(message, [event, { ...event, linkedApplicationId: "record" }])).toBe(false);
  expect(mailIsOpen({ ...message, linkedApplicationId: "record" }, [event])).toBe(false);
});
it("undo requires our current dismissal and never reopens reviewed or linked mail", () => {
  const dismissed = { ...event, status: "DISMISSED", details: { triageDismissal: "batch" } };
  const done = { ...message, attentionState: "DONE" };
  expect(mailCanUndoDismiss(done, [dismissed], "batch")).toBe(true);
  expect(mailCanUndoDismiss(done, [dismissed], "stale")).toBe(false);
  expect(mailCanUndoDismiss(done, [dismissed, { ...event, status: "REVIEWED" }], "batch")).toBe(
    false,
  );
  expect(mailCanUndoDismiss({ ...done, linkedApplicationId: "record" }, [dismissed], "batch")).toBe(
    false,
  );
  expect(mailCanUndoDismiss(done, [{ ...dismissed, details: {} }], "batch")).toBe(false);
});
