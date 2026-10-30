import { expect, it } from "vitest";
import type { mailMessages } from "@/db/schema";
import { toMailItem, type MailLookup } from "@/features/mail/mail-item";

const lookup: MailLookup = {
  companies: new Map([
    ["acme", "Acme"],
    ["globex", "Globex"],
  ]),
  applications: new Map([
    ["11111111-1111-4111-8111-111111111111", { company: "globex", role: "SDE II" }],
  ]),
};
const row = (
  patch: Partial<typeof mailMessages.$inferSelect> & { outcome?: string | null } = {},
) => ({
  id: "22222222-2222-4222-8222-222222222222",
  externalId: "x",
  threadId: null,
  provider: "GMAIL",
  sender: "talent@acme.invalid",
  senderName: "Talent",
  recipient: "",
  accountEmail: "me@gmail.com",
  subject: "Interview",
  snippet: "Short preview",
  receivedAt: new Date("2026-10-30T05:00:00Z"),
  bodyText: "Full body",
  bodyHtml: "<p>never shown</p>",
  classification: "INTERVIEW" as const,
  linkedApplicationId: null,
  processedAt: null,
  attentionState: "OPEN",
  companyKey: "acme",
  folders: ["Inbox"],
  createdAt: new Date("2026-10-30T05:00:00Z"),
  outcome: null,
  ...patch,
});

it("prefers the linked application's company", () => {
  const item = toMailItem(
    row({ linkedApplicationId: "11111111-1111-4111-8111-111111111111" }),
    lookup,
  );
  expect(item.company).toEqual({ key: "globex", name: "Globex" });
  expect(item.application).toEqual({ id: "11111111-1111-4111-8111-111111111111", role: "SDE II" });
});

it("falls back to the placed company key", () => {
  expect(toMailItem(row(), lookup).company).toEqual({ key: "acme", name: "Acme" });
  expect(toMailItem(row({ companyKey: "unknown co" }), lookup).company).toEqual({
    key: "unknown co",
    name: "unknown co",
  });
  expect(toMailItem(row({ companyKey: null }), lookup).company).toBeNull();
});

it("serializes DONE as handled and OPEN as open", () => {
  const open = toMailItem(row(), lookup);
  expect(open).toMatchObject({
    attention: "open",
    handledAt: null,
    tag: "process",
    kind: "Interview",
  });
  const done = toMailItem(
    row({ attentionState: "DONE", processedAt: new Date("2026-10-30T06:00:00Z") }),
    lookup,
  );
  expect(done).toMatchObject({ attention: "handled", handledAt: "2026-10-30T06:00:00.000Z" });
  expect(JSON.stringify(done)).not.toContain("never shown");
});

it("uses the snippet when the body is empty", () => {
  expect(toMailItem(row({ bodyText: "" }), lookup).text).toBe("Short preview");
  expect(toMailItem(row({ bodyText: null }), lookup).text).toBe("Short preview");
});

it("drops an unknown outcome id", () => {
  expect(toMailItem(row({ outcome: "oa" }), lookup).outcome).toBe("oa");
  expect(toMailItem(row({ outcome: "made-up" }), lookup).outcome).toBeNull();
});
