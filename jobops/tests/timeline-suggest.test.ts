import { describe, expect, it } from "vitest";
import type { RecordState } from "@/features/applications/phase";
import type { MailItem } from "@/features/mail/mail-item";
import { suggestHandling, suggestionFor } from "@/features/timeline/suggest";

const item = (patch: Partial<MailItem> = {}): MailItem => ({
  id: "mail-1",
  account: "me@example.com",
  provider: "GMAIL",
  folders: ["INBOX"],
  receivedAt: "2026-10-31T04:00:00.000Z",
  sender: "priya@northstar.dev",
  senderName: "Priya",
  subject: "Next round",
  text: "Hello",
  company: { key: "northstar", name: "Northstar" },
  application: null,
  tag: "process",
  kind: "Interview",
  attention: "open",
  handledAt: null,
  outcome: null,
  ...patch,
});
const state = (patch: Partial<RecordState> = {}): RecordState => ({
  source: "DIRECT",
  status: "APPLIED",
  sent: true,
  replied: false,
  referred: false,
  rounds: [],
  ...patch,
});
const role = (id: string, patch: Partial<RecordState> = {}) => ({
  id,
  role: `Role ${id}`,
  state: state(patch),
});

describe("suggestHandling", () => {
  it("suggests the classification's outcome when allowed", () => {
    expect(suggestHandling(item(), [role("a")])).toMatchObject({
      chosen: "a",
      suggested: "scheduled",
      reason: "Suggested for an interview email.",
    });
  });

  it("falls back to Just info when not allowed", () => {
    const handling = suggestHandling(item({ kind: "Offer", tag: "offer" }), [role("a")]);
    expect(handling.applications[0].outcomes).not.toContain("offer");
    expect(handling).toMatchObject({
      suggested: "info",
      reason: "Nothing to record from this email.",
    });
  });

  it("uses the linked application first", () => {
    const handling = suggestHandling(item({ application: { id: "b", role: "Role b" } }), [
      role("a"),
      role("b"),
    ]);
    expect(handling.chosen).toBe("b");
  });

  it("asks which role with several open", () => {
    const handling = suggestHandling(item(), [
      role("a"),
      role("b"),
      role("c", { status: "REJECTED" }),
    ]);
    expect(handling.chosen).toBeNull();
    expect(handling.applications.map((app) => app.id)).toEqual(["a", "b"]);
    expect(handling.suggested).toBe("scheduled");
  });

  it("offers only Just info without an application", () => {
    expect(suggestHandling(item(), [])).toEqual({
      applications: [],
      chosen: null,
      suggested: "info",
      reason: "Nothing to record from this email.",
    });
  });

  it("matches the suggestion and its reason to the chosen role", () => {
    const booked = {
      rounds: [{ kind: "DSA" as const, outcome: "SCHEDULED" as const, scheduledAt: null }],
    };
    const handling = suggestHandling(item(), [
      role("a"),
      role("b", { status: "TECHNICAL_INTERVIEW", ...booked }),
    ]);
    expect(handling.chosen).toBeNull();
    expect(suggestionFor(handling, "a")).toEqual({
      suggested: "scheduled",
      reason: "Suggested for an interview email.",
    });
    expect(suggestionFor(handling, "b")).toEqual({
      suggested: null,
      reason: "Nothing to record from this email.",
    });
  });
});
