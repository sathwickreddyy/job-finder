import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Companies from "./Companies";

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

const FIXTURE = [
  {
    id: 1,
    name: "Razorpay",
    ats_type: "lever",
    board_token: null,
    org_slug: null,
    company_slug: "razorpay",
    priority: "P0",
    enabled: true,
    preferred_locations: ["Bengaluru"],
    updated_at: "2026-05-05",
  },
  {
    id: 2,
    name: "Rubrik",
    ats_type: "greenhouse",
    board_token: "rubrik",
    org_slug: null,
    company_slug: null,
    priority: "P1",
    enabled: true,
    preferred_locations: [],
    updated_at: "2026-05-05",
  },
];

describe("Companies settings", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (
        url.includes("/api/settings/companies") &&
        !url.match(/\/\d+$/)
      ) {
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

  it("renders heading and both companies", async () => {
    render(wrap(<Companies />));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Companies" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Razorpay")).toBeInTheDocument();
    expect(screen.getByText("Rubrik")).toBeInTheDocument();
  });

  it("renders the Add form and it is disabled when name is empty", async () => {
    render(wrap(<Companies />));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Name")).toBeInTheDocument(),
    );
    const addBtn = screen.getAllByRole("button", { name: /Add/ })[0];
    expect(addBtn).toBeDisabled();
  });

  it("Add button enables when name typed", async () => {
    const user = userEvent.setup();
    render(wrap(<Companies />));
    const nameInput = await screen.findByPlaceholderText("Name");
    await user.type(nameInput, "Acme");
    const addBtn = screen.getAllByRole("button", { name: /Add/ })[0];
    expect(addBtn).not.toBeDisabled();
  });

  it("renders board_token/slug column with tokens", async () => {
    render(wrap(<Companies />));
    await waitFor(() =>
      expect(screen.getByText("rubrik")).toBeInTheDocument(),
    );
    expect(screen.getByText("razorpay")).toBeInTheDocument();
  });
});
