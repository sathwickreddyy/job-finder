import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriorityBadge } from "./PriorityBadge";

function badgeContaining(label: string) {
  // The badge has a decorative glyph + label, e.g. "● P0". Match the
  // surrounding span (the Badge root) by label substring.
  const labelEl = screen.getByText((_, el) =>
    !!el && el.tagName.toLowerCase() === "span" && (el.textContent ?? "").includes(label),
  );
  return labelEl;
}

describe("PriorityBadge", () => {
  it("P0 uses cyan tone", () => {
    render(<PriorityBadge priority="P0" />);
    const el = badgeContaining("P0");
    expect(el.className).toContain("text-accent");
  });

  it("P1 uses amber tone", () => {
    render(<PriorityBadge priority="P1" />);
    const el = badgeContaining("P1");
    expect(el.className).toContain("text-accent-amber");
  });

  it("Ignore uses red tone", () => {
    render(<PriorityBadge priority="Ignore" />);
    const el = badgeContaining("Ignore");
    expect(el.className).toContain("text-danger");
  });

  it("includes a shape glyph for non-color cue (P0 is filled)", () => {
    const { container } = render(<PriorityBadge priority="P0" />);
    // Filled circle glyph is present as the aria-hidden span content.
    expect(container.textContent).toContain("●");
  });

  it("uses a distinct glyph for P1 (half circle)", () => {
    const { container } = render(<PriorityBadge priority="P1" />);
    expect(container.textContent).toContain("◐");
  });
});
