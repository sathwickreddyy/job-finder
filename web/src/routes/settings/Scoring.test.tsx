import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Scoring from "./Scoring";

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
  thresholds: { P0: 80, P1: 70, P2: 60 },
  positive_keywords: ["python", "fastapi"],
  negative_keywords: ["frontend only"],
};

describe("Scoring settings", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("/api/settings/scoring")) {
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

  it("renders heading and threshold values", async () => {
    render(wrap(<Scoring />));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Scoring" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("80")).toBeInTheDocument();
    expect(screen.getByDisplayValue("70")).toBeInTheDocument();
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
  });

  it("renders keyword lists", async () => {
    render(wrap(<Scoring />));
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("python, fastapi"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("frontend only")).toBeInTheDocument();
  });

  it("Save button is rendered", async () => {
    render(wrap(<Scoring />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument(),
    );
  });
});
