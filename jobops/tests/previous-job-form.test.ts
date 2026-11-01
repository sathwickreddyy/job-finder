import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/companies/actions", () => ({ addPreviousJobAction: vi.fn() }));
const { PreviousJobForm, savedText } = await import("@/features/companies/previous-job-form");

const input = (html: string, name: string) =>
  html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];

it("requires role and joined month", () => {
  const html = renderToStaticMarkup(
    createElement(PreviousJobForm, { company: { key: "amazon", name: "Amazon" } }),
  );
  expect(input(html, "role")).toContain("required");
  expect(input(html, "joinedOn")).toMatch(/type="month"[^>]*required|required[^>]*type="month"/);
  expect(input(html, "leftOn")).toContain('type="month"');
  expect(input(html, "leftOn")).not.toContain("required");
  expect(html).toContain('name="notes"');
  // Nothing is guessed: every field starts empty.
  expect(html).not.toMatch(/<input[^>]*name="(?:role|joinedOn|leftOn)"[^>]*value="[^"]+"/);
  expect(savedText(0)).toBe("Saved.");
  expect(savedText(1)).toBe("Saved. Linked 1 email.");
  expect(savedText(7)).toBe("Saved. Linked 7 emails.");
});

it("asks for the company only from Companies", () => {
  const onPage = renderToStaticMarkup(
    createElement(PreviousJobForm, { company: { key: "amazon", name: "Amazon" } }),
  );
  expect(input(onPage, "company")).toBeUndefined();
  const fromCompanies = renderToStaticMarkup(createElement(PreviousJobForm, {}));
  expect(input(fromCompanies, "company")).toContain("required");
});
