import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sources from "./Sources";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

const FIXTURE = {
  remotive: { enabled: true, limit: 100 },
  ycombinator: { enabled: true },
  manual: { enabled: true },
  greenhouse: { enabled: false },
};

describe("Sources settings", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("/api/settings/sources")) {
        return new Response(JSON.stringify(FIXTURE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders heading and source rows", async () => {
    render(wrap(<Sources />));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Sources" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("remotive")).toBeInTheDocument();
    expect(screen.getByText("ycombinator")).toBeInTheDocument();
  });

  it("shows the ycombinator description", async () => {
    render(wrap(<Sources />));
    await waitFor(() =>
      expect(screen.getByText(/YC Work at a Startup/)).toBeInTheDocument(),
    );
  });

  it("renders Re-import YAML button", async () => {
    render(wrap(<Sources />));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Re-import YAML/ }),
      ).toBeInTheDocument(),
    );
  });

  it("clicking a checkbox toggles draft state (no error, no crash)", async () => {
    const user = userEvent.setup();
    render(wrap(<Sources />));
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
    // ycombinator starts enabled; click to disable
    await user.click(checkboxes[0]);
  });
});
