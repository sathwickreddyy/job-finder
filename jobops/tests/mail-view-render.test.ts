import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MailViewData } from "@/features/timeline/mail-data";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/mail/workspace-actions", () => ({
  checkMail: vi.fn(),
  handleMailAction: vi.fn(),
  placeMailAction: vi.fn(),
  reopenMailAction: vi.fn(),
  saveWorkspaceRule: vi.fn(),
}));
const { MailView } = await import("@/features/timeline/mail-view");

const data = (patch: Partial<MailViewData> = {}): MailViewData => ({
  query: { company: null, home: false, tag: null, q: null, role: null, mail: null, cursor: null },
  index: {
    rows: [
      {
        key: "lumen",
        name: "Lumen",
        slug: null,
        group: "waiting",
        signal: "Follow up if it stays quiet",
        next: "Follow up if it stays quiet",
        due: { label: "Sun", tone: "calm" },
        newCount: 0,
        matches: null,
        latestAt: null,
      },
    ],
    home: { open: 0, total: 0, matches: null },
  },
  pane: { kind: "empty" },
  placeOptions: { companies: [], applications: [] },
  inboxes: {
    connections: [
      {
        id: "c1",
        provider: "GMAIL",
        email: "me@example.com",
        lastChecked: "2026-10-31T04:00:00.000Z",
        lastError: null,
      },
    ],
    configs: [],
    coverage: [],
  },
  lastChecked: "2026-10-31T04:00:00.000Z",
  notice: null,
  ...patch,
});
const render = (value: MailViewData) =>
  renderToStaticMarkup(createElement(MailView, { data: value }));

describe("MailView", () => {
  it("says nothing needs you with the last check and Check mail", () => {
    const html = render(data());
    expect(html).toContain("Nothing needs you");
    expect(html).toContain("Check mail");
    expect(html).toContain("Checked ");
    expect(html).toContain("Waiting on them");
    expect(html).not.toContain(">Needs you<");
  });

  it("says no mail matches while filtered", () => {
    const html = render(
      data({
        query: { ...data().query, q: "nothing" },
        index: { rows: [], home: { open: 0, total: 0, matches: 0 } },
      }),
    );
    expect(html).toContain("No mail matches");
    expect(html).not.toContain("Nothing needs you");
  });

  it("shows a notice from the URL", () => {
    expect(render(data({ notice: "Gmail could not be verified." }))).toContain(
      "Gmail could not be verified.",
    );
  });
});
