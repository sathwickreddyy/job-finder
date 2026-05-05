import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

// Dashboard now issues a /api/dashboard fetch on mount; hang it so the route
// stays in LoadingState and App routing assertions remain stable.
beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("App routing", () => {
  it("renders Dashboard at /", () => {
    renderAt("/");
    expect(screen.getByText("job-finder")).toBeInTheDocument(); // NavBar present
  });

  it("renders Tracker at /tracker with NavBar", () => {
    renderAt("/tracker");
    expect(screen.getByRole("heading", { name: "Tracker" })).toBeInTheDocument();
  });

  it("redirects /settings → /settings/profile", () => {
    renderAt("/settings");
    // Profile route now fetches on mount and sits in LoadingState with the
    // hanging stub, so assert the Profile tab is active in the settings sidebar.
    const profileTab = screen.getByRole("link", { name: "Profile" });
    expect(profileTab).toHaveAttribute("href", "/settings/profile");
    expect(profileTab.className).toContain("bg-surface");
  });
});
