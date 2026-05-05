import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("default tone is grey", () => {
    render(<Badge>P2</Badge>);
    expect(screen.getByText("P2").className).toContain("text-text-muted");
  });

  it("cyan tone applies accent class", () => {
    render(<Badge tone="cyan">P0</Badge>);
    expect(screen.getByText("P0").className).toContain("text-accent");
  });
});
