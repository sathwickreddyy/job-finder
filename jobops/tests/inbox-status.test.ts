import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { InboxStatus, accountTone } from "@/features/applications/views/inboxes";
vi.mock("@/features/applications/views/refresh-feedback", () => ({
  FreshMailBanner: () => null,
  RefreshAllButton: () => null,
}));
it("keeps Outlook connect available with two accounts and names every reconnect link", () => {
  const connections = ["a@gmail.com", "b@outlook.in", "c@outlook.com"].map((email, index) => ({
    id: String(index),
    email,
    provider: index ? "OUTLOOK" : "GMAIL",
    lastRefreshedAt: null,
    lastRefreshedCount: null,
    lastError: "Access expired.",
  }));
  const html = renderToStaticMarkup(
    createElement(InboxStatus, {
      connections,
      configs: [
        { slug: "gmail", label: "Gmail", configured: true, missing: [] },
        { slug: "outlook", label: "Outlook", configured: true, missing: [] },
      ],
      now: new Date(),
      count: 0,
    }),
  );
  expect(html).toMatch(/<a href="\/api\/mail\/outlook\/connect"[^>]*>Connect Outlook<\/a>/);
  for (const connection of connections) {
    expect(html).toContain(`aria-label="Reconnect ${connection.email}"`);
    expect(html).toContain(`aria-describedby="reconnect-${connection.id}"`);
    expect(html).toContain(`id="reconnect-${connection.id}"`);
    expect(html).toContain(`Choose ${connection.email} when you sign in again.`);
  }
  expect(accountTone(0)).not.toBe(accountTone(1));
  expect(accountTone(1)).not.toBe(accountTone(2));
  expect(accountTone(3)).toBe("bg-chart-other");
});

it("explains an unconfigured provider in plain words and keeps the variables in Setup details", () => {
  const html = renderToStaticMarkup(
    createElement(InboxStatus, {
      connections: [],
      configs: [
        { slug: "gmail", label: "Gmail", configured: false, missing: ["GOOGLE_CLIENT_ID"] },
      ],
      now: new Date(),
      count: 0,
    }),
  );
  expect(html).toContain("Gmail isn&#x27;t set up on this computer yet.");
  expect(html).toMatch(/<details[^>]*><summary[^>]*>Setup details<\/summary>/);
  expect(html).toContain("Set GOOGLE_CLIENT_ID in .env");
});
