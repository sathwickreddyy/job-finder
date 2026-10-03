import { describe, expect, it } from "vitest";
import { safeReturnTo, withNotice } from "@/features/applications/return-to";

describe("return paths", () => {
  it("keeps Applications paths with their query", () => {
    const lane = "/applications?open=00000000-0000-4000-8000-000000000001";
    expect(safeReturnTo(lane)).toBe(lane);
    expect(safeReturnTo("/applications/00000000-0000-4000-8000-000000000001")).toBe(
      "/applications/00000000-0000-4000-8000-000000000001",
    );
  });

  it.each([
    "",
    "https://evil.example/applications",
    "//evil.example/applications",
    "/\\evil.example",
    "/settings",
    "/applicationsevil",
    "javascript:alert(1)",
    "/applications/../settings",
  ])("rejects %j", (value) => {
    expect(safeReturnTo(value)).toBeNull();
  });

  it("adds a notice without losing the lane", () => {
    expect(withNotice("/applications?open=abc", "Message linked.")).toBe(
      "/applications?open=abc&notice=Message+linked.",
    );
  });
});
