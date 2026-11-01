import { describe, expect, it } from "vitest";
import { inboxLabels, previewLine } from "@/features/mail/row-text";

describe("previewLine", () => {
  it("skips greetings to the first line that says something", () => {
    expect(previewLine("Hi Sathwick,\n\nYour round is confirmed for Tue.")).toBe(
      "Your round is confirmed for Tue.",
    );
    expect(previewLine("Dear Ex Amazonian,\nWe're hiring SDE-IIs.")).toBe("We're hiring SDE-IIs.");
    expect(previewLine("Hello,\nGood morning team!\nPlease share slots.")).toBe(
      "Please share slots.",
    );
  });

  it("drops invisible preheader padding that left a stray ellipsis", () => {
    const padded = "Earn CTC upto INR 40 LPA! ‌ ‌ ͏­﻿​";
    expect(previewLine(padded)).toBe("Earn CTC upto INR 40 LPA!");
    expect(previewLine("Hi,\n‌ ‌ \nReal text")).toBe("Real text");
  });

  it("keeps a sentence that merely starts like a greeting", () => {
    expect(previewLine("Hi Sathwick, your offer letter is attached and ready to sign.")).toBe(
      "Hi Sathwick, your offer letter is attached and ready to sign.",
    );
  });

  it("is empty when nothing is left", () => {
    expect(previewLine("Hi,\n\n")).toBe("");
  });
});

describe("inboxLabels", () => {
  it("names each inbox by its domain when that tells them apart", () => {
    expect(
      inboxLabels(["me@gmail.com", "sathwick@outlook.in", "sathwickreddyy@outlook.com"]),
    ).toEqual({
      "me@gmail.com": "gmail.com",
      "sathwick@outlook.in": "outlook.in",
      "sathwickreddyy@outlook.com": "outlook.com",
    });
  });

  it("uses the full address when two inboxes share a domain", () => {
    expect(inboxLabels(["a@gmail.com", "b@gmail.com", "c@outlook.com", "a@gmail.com"])).toEqual({
      "a@gmail.com": "a@gmail.com",
      "b@gmail.com": "b@gmail.com",
      "c@outlook.com": "outlook.com",
    });
  });
});
