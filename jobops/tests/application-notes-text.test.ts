import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NotesText } from "@/features/applications/views/notes-text";

it("clamps long notes to four lines behind Show all", () => {
  const html = renderToStaticMarkup(createElement(NotesText, { text: "line\n".repeat(12) }));
  expect(html).toContain("line-clamp-4");
  expect(html).toContain("Show all");
});

it("shows short notes in full and says when there are none", () => {
  expect(renderToStaticMarkup(createElement(NotesText, { text: "Short note" }))).not.toContain(
    "Show all",
  );
  expect(renderToStaticMarkup(createElement(NotesText, { text: "" }))).toContain("No notes yet.");
});
