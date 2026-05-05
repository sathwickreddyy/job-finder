import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Tracker from "./Tracker";

function wrap(node: React.ReactNode, initialEntries: string[] = ["/tracker"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const ROW = {
  job: {
    id: "x1", role: "Senior Backend", company: "Acme", url: "https://x/1",
    source: "greenhouse", location: "Bengaluru", remote_type: null,
    posted_date: null, description: "Python", notes: null,
  },
  fit_score: 85, priority: "P0",
  level_match: "SDE2", matched_skills: ["python"], missing_skills: [],
  reasons: [], risks: [], recommended_resume_variant: null, next_action: "",
};

const DASHBOARD_FIXTURE = {
  counts_by_priority: {},
  total_jobs: 0,
  last_run_at: null,
  upcoming_interviews: [
    { job_id: "abc", role: "Senior Backend", company: "Acme", next_interview_at: "2026-05-10T15:00:00Z" },
  ],
  shortlist_top: [],
  latest_source_stats: {},
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = urlOf(input);
    if (url.includes("/api/dashboard")) {
      return new Response(JSON.stringify(DASHBOARD_FIXTURE), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify([ROW]), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tracker", () => {
  it("renders heading and results table", async () => {
    render(wrap(<Tracker />));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Tracker" })).toBeInTheDocument());
    // "Acme" appears in both the upcoming-interviews card and the JobTable row.
    await waitFor(() => expect(screen.getAllByText("Acme").length).toBeGreaterThan(0));
  });

  it("renders upcoming interviews section when non-empty", async () => {
    render(wrap(<Tracker />));
    await waitFor(() => expect(screen.getByText("Upcoming interviews")).toBeInTheDocument());
  });

  it("renders filter bar", async () => {
    render(wrap(<Tracker />));
    await waitFor(() => expect(screen.getByPlaceholderText(/Search role/i)).toBeInTheDocument());
  });

  it("typing in search field and blurring updates the URL query string", async () => {
    const user = userEvent.setup();
    let capturedURL = "";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      capturedURL = url;
      if (url.includes("/api/dashboard")) return new Response(JSON.stringify(DASHBOARD_FIXTURE), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });
    render(wrap(<Tracker />));
    const searchInput = await screen.findByPlaceholderText(/Search role/i);
    await user.type(searchInput, "backend");
    await user.tab(); // blur triggers set
    await waitFor(() => expect(capturedURL).toMatch(/q=backend/));
  });
});
