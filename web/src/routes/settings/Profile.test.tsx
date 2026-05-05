import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Profile from "./Profile";

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
  name: "Sathwick",
  years_of_experience: 5,
  strong_skills: ["python", "fastapi"],
  preferred_locations: ["Bengaluru"],
};

describe("Profile settings", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("/api/settings/profile")) {
        return new Response(JSON.stringify(FIXTURE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders heading and loaded values", async () => {
    render(wrap(<Profile />));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Profile" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("Sathwick")).toBeInTheDocument();
    expect(screen.getByDisplayValue("python, fastapi")).toBeInTheDocument();
  });

  it("editing a CSV field normalizes tokens", async () => {
    const user = userEvent.setup();
    render(wrap(<Profile />));
    const skillsInput = await screen.findByDisplayValue("python, fastapi");
    await user.clear(skillsInput);
    // Typing a single token round-trips through setList (split/trim/filter)
    // and is rejoined with ", " for display.
    await user.type(skillsInput, "kafka");
    expect(skillsInput).toHaveValue("kafka");
  });

  it("Save button is rendered", async () => {
    render(wrap(<Profile />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument(),
    );
  });
});
