import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "./Dashboard";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const FIXTURE = {
  counts_by_priority: { P0: 2, P1: 5, P2: 3 },
  total_jobs: 42,
  last_run_at: "2026-05-05T10:00:00Z",
  upcoming_interviews: [
    {
      job_id: "abc",
      role: "Senior Backend",
      company: "Acme",
      next_interview_at: "2026-05-10T15:00:00Z",
    },
  ],
  shortlist_top: [],
  latest_source_stats: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("shows LoadingState while fetching", () => {
    vi.stubGlobal("fetch", () => new Promise(() => {})); // hang
    render(wrap(<Dashboard />));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders stat cards with counts", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify(FIXTURE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    render(wrap(<Dashboard />));
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    expect(screen.getByText("02")).toBeInTheDocument(); // P0 padded
    expect(screen.getByText("05")).toBeInTheDocument(); // P1
    expect(screen.getByText("03")).toBeInTheDocument(); // P2
  });

  it("renders upcoming-interviews section when non-empty", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify(FIXTURE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    render(wrap(<Dashboard />));
    await waitFor(() =>
      expect(screen.getByText("Upcoming interviews")).toBeInTheDocument(),
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("error state surfaces message on 500", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ detail: [{ msg: "internal error" }] }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );
    render(wrap(<Dashboard />));
    await waitFor(() =>
      expect(screen.getByText(/internal error/)).toBeInTheDocument(),
    );
  });
});
