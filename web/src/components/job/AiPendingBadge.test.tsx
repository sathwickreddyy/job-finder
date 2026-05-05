import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiPendingBadge } from "./AiPendingBadge";

describe("AiPendingBadge", () => {
  it("renders nothing when pending=false", () => {
    const { container } = render(<AiPendingBadge pending={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders amber badge with message when pending=true", () => {
    render(<AiPendingBadge pending={true} />);
    expect(screen.getByText(/AI integration pending/)).toBeInTheDocument();
  });
});
