import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JobTable } from "./JobTable";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function wrap(node: React.ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const ROW = {
  job: {
    id: "abc123",
    role: "Senior Backend Engineer",
    company: "Acme",
    url: "https://x/1",
    location: "Bengaluru",
    source: "greenhouse",
    description: "Python FastAPI Postgres",
  },
  fit_score: 85,
  priority: "P0" as const,
  matched_skills: ["python", "fastapi"],
  missing_skills: ["kafka"],
  reasons: ["matches backend"],
  recommended_resume_variant: "master",
};

describe("JobTable", () => {
  it("shows empty state when no rows", () => {
    render(wrap(<JobTable rows={[]} />));
    expect(screen.getByText(/No jobs match/i)).toBeInTheDocument();
  });

  it("renders a row with company + role + fit + priority", () => {
    render(wrap(<JobTable rows={[ROW]} />));
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("P0")).toBeInTheDocument();
  });

  it("clicking a row expands it and shows fits/gaps", async () => {
    const user = userEvent.setup();
    render(wrap(<JobTable rows={[ROW]} />));
    // Click company cell (in the collapsed row)
    await user.click(screen.getByText("Acme"));
    // Expanded panel shows matched skills
    expect(screen.getByText(/python, fastapi/)).toBeInTheDocument();
    expect(screen.getByText(/kafka/)).toBeInTheDocument();
  });
});
