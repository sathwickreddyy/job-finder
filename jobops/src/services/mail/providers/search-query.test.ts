import { expect, it } from "vitest";
import {
  assertPhrase,
  gmailSearchQuery,
  outlookSearchQuery,
  type SearchRequest,
} from "./search-query";

const request: SearchRequest = {
  since: "2026-08-02T10:30:00.500Z",
  until: "2026-10-31T10:30:00Z",
  identity: {
    names: ["Northstar", "Northstar Labs"],
    keywords: ["Northstar Talent"],
    senders: ["talent@northstar.example"],
    domains: ["northstar.example"],
  },
};

it("builds the Gmail query for a rule", () => {
  expect(gmailSearchQuery(request)).toBe(
    '-in:sent -in:drafts after:1785666599 before:1793442600 {from:"talent@northstar.example" from:"northstar.example" subject:"Northstar" from:"Northstar" subject:"Northstar Labs" from:"Northstar Labs" "Northstar Talent"}',
  );
  expect(gmailSearchQuery({ ...request, since: undefined })).not.toContain("after:");
});

it("builds the Outlook query with widened days", () => {
  expect(outlookSearchQuery(request)).toBe(
    JSON.stringify(
      '(from:"talent@northstar.example" OR from:"northstar.example" OR subject:"Northstar" OR from:"Northstar" OR subject:"Northstar Labs" OR from:"Northstar Labs" OR "Northstar Talent") AND received>=2026-08-01 AND received<=2026-11-01',
    ),
  );
});

it("rejects quotes and backslashes", () => {
  expect(assertPhrase("  Northstar Talent ")).toBe("Northstar Talent");
  for (const value of ['say "hi"', "a\\b", "bell\u0007", "line\nbreak", "   "])
    expect(() => assertPhrase(value)).toThrow();
  const bad = { ...request, identity: { ...request.identity, keywords: ['Talent" OR "x'] } };
  expect(() => gmailSearchQuery(bad)).toThrow();
  expect(() => outlookSearchQuery(bad)).toThrow();
});
