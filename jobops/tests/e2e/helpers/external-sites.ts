import type { Page } from "@playwright/test";

const image = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="100" viewBox="0 0 640 100"><rect width="640" height="100" fill="#1a73e8"/><text x="24" y="60" fill="white" font-size="24">Fictional browser fixture</text></svg>`;

/** Every external HTTP request is fulfilled locally or aborted, including unexpected hosts. */
export async function stubExternalSites(page: Page) {
  const appOrigin = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3211").origin;
  await page.context().route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) return route.continue();
    if (
      (url.hostname === "www.google.com" && url.pathname === "/s2/favicons") ||
      (url.hostname === "github.com" && url.pathname.endsWith(".png")) ||
      url.hostname === "ghchart.rshah.org"
    )
      return route.fulfill({ contentType: "image/svg+xml", body: image });
    if (url.hostname === "portfolio.example.invalid")
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body><h1>Fictional portfolio</h1><button onclick=\"this.textContent='Demo clicked'\">Explore demo</button></body></html>",
      });
    if (url.hostname === "platform.linkedin.com" && url.pathname === "/badges/js/profile.js")
      return route.fulfill({
        contentType: "text/javascript",
        body: "/* Official badge unavailable in the local fixture. */",
      });
    return route.abort("blockedbyclient");
  });
}
