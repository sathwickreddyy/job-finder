import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CsvInput } from "./CsvInput";

describe("CsvInput", () => {
  it("does NOT commit while the user is typing mid-word", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<CsvInput value={[]} onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "Senior Software Engineer,");
    expect(onCommit).not.toHaveBeenCalled();
    // Typed value preserved verbatim; mid-word commas don't split.
    expect(input).toHaveValue("Senior Software Engineer,");
  });

  it("commits on blur with trimmed + deduped parsed list", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<CsvInput value={[]} onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "  Backend  ,  Platform  ,");
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(["Backend", "Platform"]);
  });

  it("commits on Enter key", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<CsvInput value={[]} onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "A, B{Enter}");
    expect(onCommit).toHaveBeenCalledWith(["A", "B"]);
  });

  it("does NOT commit on blur when nothing changed", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<CsvInput value={["A", "B"]} onCommit={onCommit} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("A, B");
    input.focus();
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("re-syncs when external value prop changes", () => {
    const { rerender } = render(<CsvInput value={["X"]} onCommit={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("X");
    rerender(<CsvInput value={["Y", "Z"]} onCommit={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("Y, Z");
  });
});
