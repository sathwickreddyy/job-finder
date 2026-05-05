import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriorityBadge } from "./PriorityBadge";

describe("PriorityBadge", () => {
  it("P0 uses cyan tone", () => {
    render(<PriorityBadge priority="P0" />);
    const el = screen.getByText("P0");
    expect(el.className).toContain("text-accent");
  });

  it("P1 uses amber tone", () => {
    render(<PriorityBadge priority="P1" />);
    const el = screen.getByText("P1");
    expect(el.className).toContain("text-accent-amber");
  });

  it("Ignore uses red tone", () => {
    render(<PriorityBadge priority="Ignore" />);
    const el = screen.getByText("Ignore");
    expect(el.className).toContain("text-danger");
  });
});
