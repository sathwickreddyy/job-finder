import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  it("does not render when open=false", () => {
    render(<Dialog open={false} onClose={() => {}}><p>hidden</p></Dialog>);
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("renders children when open=true", () => {
    render(<Dialog open={true} onClose={() => {}}><p>shown</p></Dialog>);
    expect(screen.getByText("shown")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    let closed = false;
    render(<Dialog open={true} onClose={() => { closed = true; }}><p>x</p></Dialog>);
    await user.keyboard("{Escape}");
    expect(closed).toBe(true);
  });

  it("has role=dialog and aria-modal=true for assistive tech", () => {
    render(<Dialog open={true} onClose={() => {}}><p>x</p></Dialog>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
