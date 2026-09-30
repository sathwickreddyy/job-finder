import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  proposalSchema,
  stableDigest,
  updateSchema,
} from "@/features/tasks/domain";
describe("personalized task boundary", () => {
  it("accepts a custom goal without assigning a developer role", () => {
    expect(
      createTaskSchema.parse({
        kind: "CUSTOM",
        title: "Choose my next project",
        goal: "Discuss useful projects with me based on our previous conversations.",
        context: "",
        assistant: "ChatGPT",
      }).context,
    ).toBe("");
  });
  it("rejects agent-supplied approval and execution without a proposal", () => {
    expect(
      updateSchema.safeParse({
        requestId: "one",
        status: "EXECUTED",
        summary: "I applied",
        humanConfirmed: true,
      }).success,
    ).toBe(false);
    expect(
      proposalSchema.safeParse({
        requestId: "one",
        summary: "My draft",
        approved: true,
        payload: { kind: "NOTE", content: "Draft" },
      }).success,
    ).toBe(false);
  });
  it("binds retries to identical content independent of object key order", () => {
    expect(stableDigest({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableDigest({ b: { d: 3, c: 2 }, a: 1 }),
    );
    expect(stableDigest({ draft: "one" })).not.toBe(stableDigest({ draft: "two" }));
  });
  it("rejects executable links in proposed public changes", () => {
    expect(
      proposalSchema.safeParse({
        requestId: "one",
        summary: "Publish this",
        payload: {
          kind: "SHOWCASE",
          title: "Project",
          targetUrl: "javascript:alert(1)",
          content: "My real project case study",
        },
      }).success,
    ).toBe(false);
  });
});

it("requires workspace protection before creating or using task credentials", async () => {
  const { requireProtectedWorkspace } = await import("@/features/tasks/credentials");
  const original = process.env.JOBOPS_ACCESS_TOKEN;
  try {
    process.env.JOBOPS_ACCESS_TOKEN = "";
    expect(requireProtectedWorkspace).toThrow("Enable a workspace access key");
    process.env.JOBOPS_ACCESS_TOKEN = "short";
    expect(requireProtectedWorkspace).toThrow("Enable a workspace access key");
    process.env.JOBOPS_ACCESS_TOKEN = "test-only-access-key-with-at-least-32-characters";
    expect(requireProtectedWorkspace).not.toThrow();
  } finally {
    if (original === undefined) delete process.env.JOBOPS_ACCESS_TOKEN;
    else process.env.JOBOPS_ACCESS_TOKEN = original;
  }
});
