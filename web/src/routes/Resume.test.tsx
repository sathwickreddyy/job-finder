import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Resume from "./Resume";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const RESUME_PORTFOLIO = {
  md_source: "portfolio",
  markdown: "# Sathwick\n\nSenior Backend Engineer",
  has_pdf: true,
  has_docx: false,
};

const RESUME_NONE = {
  md_source: "none",
  markdown: "",
  has_pdf: false,
  has_docx: false,
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe("Resume", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("/api/resume")) {
        return new Response(JSON.stringify(RESUME_PORTFOLIO), {
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

  it("renders heading + portfolio badge", async () => {
    render(wrap(<Resume />));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Resume" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("portfolio")).toBeInTheDocument();
  });

  it("renders markdown in preview", async () => {
    render(wrap(<Resume />));
    await waitFor(() =>
      expect(screen.getByText("Sathwick")).toBeInTheDocument(),
    );
  });

  it("renders PDF download button when has_pdf=true", async () => {
    render(wrap(<Resume />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /PDF/ })).toBeInTheDocument(),
    );
  });

  it("Save button is disabled when draft matches original", async () => {
    render(wrap(<Resume />));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Save$/ }),
      ).toBeInTheDocument(),
    );
    const saveBtn = screen.getByRole("button", { name: /^Save$/ });
    expect(saveBtn).toBeDisabled();
  });

  it("Save button is enabled after user edits the textarea", async () => {
    const user = userEvent.setup();
    render(wrap(<Resume />));
    const textarea = await screen.findByRole("textbox");
    await user.click(textarea);
    await user.keyboard(" edited");
    const saveBtn = screen.getByRole("button", { name: /^Save$/ });
    expect(saveBtn).not.toBeDisabled();
  });

  it("renders 'none' badge when md_source=none", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify(RESUME_NONE), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    render(wrap(<Resume />));
    await waitFor(() => expect(screen.getByText("none")).toBeInTheDocument());
  });
});
