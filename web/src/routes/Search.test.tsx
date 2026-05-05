import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Search from "./Search";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const SEARCH_OK = {
  jobs: [
    {
      job: {
        id: "x1", role: "Senior Backend", company: "Acme", url: "https://x/1",
        source: "ycombinator", location: "Bengaluru", remote_type: null,
        posted_date: null, description: "Python", notes: null,
      },
      fit_score: 85, priority: "P0",
      level_match: "SDE2", matched_skills: ["python"], missing_skills: [],
      reasons: [], risks: [], recommended_resume_variant: null, next_action: "",
    },
  ],
  source_stats: {
    ycombinator: { fetched: 1, kept: 1, duration_ms: 10, error: null },
    remotive: { fetched: 0, kept: 0, duration_ms: 5, error: "timeout" },
  },
  ran_at: "2026-05-05T10:00:00Z", duration_ms: 20,
};

beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(SEARCH_OK), { status: 200, headers: { "content-type": "application/json" }}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Search", () => {
  it("renders the search form with Run button", () => {
    render(wrap(<Search />));
    expect(screen.getByRole("button", { name: /Run search/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Location filter/i)).toBeInTheDocument();
  });

  it("clicking Run search posts and renders SourceStatsBar", async () => {
    const user = userEvent.setup();
    render(wrap(<Search />));
    await user.click(screen.getByRole("button", { name: /Run search/i }));
    // ycombinator appears in both SourceStatsBar and the JobTable row's source
    // column — use getAllByText to tolerate both matches.
    await waitFor(() => expect(screen.getAllByText(/ycombinator/).length).toBeGreaterThan(0));
    // timeout source appears with error icon (test via text)
    expect(screen.getByText(/remotive/)).toBeInTheDocument();
  });

  it("renders Acme job in results table after search", async () => {
    const user = userEvent.setup();
    render(wrap(<Search />));
    await user.click(screen.getByRole("button", { name: /Run search/i }));
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
  });

  it("Add manual job button opens the dialog with AI-pending banner", async () => {
    const user = userEvent.setup();
    render(wrap(<Search />));
    await user.click(screen.getByRole("button", { name: /Add manual job/i }));
    expect(screen.getByText(/AI-powered JD import/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Role \(required\)/)).toBeInTheDocument();
  });
});
