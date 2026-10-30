import { expect, it } from "vitest";
import { mailIsOpen } from "@/features/mail/state";

it("reads attention only; links and review events no longer decide it", () => {
  expect(mailIsOpen({ attentionState: "OPEN" })).toBe(true);
  expect(mailIsOpen({ attentionState: "DONE" })).toBe(false);
  expect(mailIsOpen({ attentionState: "OPEN", linkedApplicationId: "record" } as never)).toBe(true);
});
