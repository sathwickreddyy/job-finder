import { describe, expect, it } from "vitest";
import { matchingRoles } from "@/features/timeline/role-match";

const apps = [
  { id: "a", role: "Software Dev Engineer II, 3P Pricing", requisition: "10600856" },
  { id: "b", role: "Software Development Engineer, CS ARIA", requisition: "10604005" },
  { id: "c", role: "Sr Software Engineer", requisition: null },
];

describe("matchingRoles", () => {
  it("matches a requisition as a whole token", () => {
    expect(
      matchingRoles({ subject: "Keep track of your application (10604005)", text: "" }, apps),
    ).toEqual(new Set(["b"]));
  });

  it("ignores a requisition inside a longer number or URL path", () => {
    expect(
      matchingRoles({ subject: "", text: "ref 1106008567 https://x.example/10600856abc" }, apps),
    ).toEqual(new Set());
  });

  it("falls back to the exact role title, case and space insensitive", () => {
    expect(
      matchingRoles(
        { subject: "", text: "your application for  software development engineer, cs aria" },
        apps,
      ),
    ).toEqual(new Set(["b"]));
  });

  it("does not match a role title that is only part of a longer title", () => {
    expect(matchingRoles({ subject: "", text: "Sr Software Engineer II" }, apps)).toEqual(
      new Set(),
    );
  });

  it("returns every match", () => {
    expect(matchingRoles({ subject: "10600856 and 10604005", text: "" }, apps)).toEqual(
      new Set(["a", "b"]),
    );
  });
});
