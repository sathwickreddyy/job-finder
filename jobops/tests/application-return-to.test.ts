import { describe, expect, it } from "vitest";
import {
  safePageReturnTo,
  safeReturnTo,
  safeRowReturnTo,
  withNotice,
} from "@/features/applications/return-to";

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

  it("keeps the Mail view or a company page, dropping an old notice", () => {
    expect(safePageReturnTo("/mail?company=amazon&role=x")).toBe("/mail?company=amazon&role=x");
    expect(safePageReturnTo("/mail?view=all&notice=Old")).toBe("/mail?view=all");
    expect(safePageReturnTo("/companies/amazon?tab=applications")).toBe(
      "/companies/amazon?tab=applications",
    );
    for (const value of [
      "",
      "//evil.example/mail",
      "https://evil.example/mail",
      "/mailbox",
      "/companies",
      "/companies/a/b",
      "/companies/../settings",
      "/settings",
    ])
      expect(safePageReturnTo(value)).toBeNull();
  });

  it("keeps only an application's open row on a company page", () => {
    const row = "/companies/acme%20corp?open=00000000-0000-4000-8000-000000000001";
    expect(safeRowReturnTo(row)).toBe(row);
    expect(safeRowReturnTo(`${row}#application-x`)).toBe(row);
    for (const value of [
      "",
      "/companies/acme",
      "/companies/acme?open=x",
      `${row}&mail=1`,
      "/companies/a/b?open=00000000-0000-4000-8000-000000000001",
      "//evil.example/companies/a?open=00000000-0000-4000-8000-000000000001",
      "/settings?open=00000000-0000-4000-8000-000000000001",
    ])
      expect(safeRowReturnTo(value)).toBeNull();
  });

  it("adds a notice without losing the lane", () => {
    expect(withNotice("/applications?open=abc", "Message linked.")).toBe(
      "/applications?open=abc&notice=Message+linked.",
    );
  });
});
