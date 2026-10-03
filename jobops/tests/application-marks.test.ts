import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RoundLadder } from "@/features/applications/views/marks";

it("labels research slots without inventing recorded rounds", () => {
  const html = renderToStaticMarkup(createElement(RoundLadder, { rounds: [], typical: 16 }));
  expect(html).toContain('aria-label="Typical loop: 16 rounds (company research)"');
  expect(html.match(/border-2 border-dashed/g)).toHaveLength(16);
  expect(html).not.toContain("<button");
});
