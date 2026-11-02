import { afterEach, describe, expect, it, vi } from "vitest";
import { matchResumeToJob, stripMetadataBlock } from "@/features/resumes/score/resumenext-client";
import { assessLexical, suggestTerms } from "@/features/resumes/score/scoring-client";
import { ToolError } from "@/features/resumes/score/tool-error";
import type { ReviewedTerm } from "@/features/resumes/score/terms";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const terms: ReviewedTerm[] = [
  { term: "Java", aliases: [], importance: "required", jdQuote: "We need Java." },
  { term: "Jira", aliases: [], importance: "skip", jdQuote: "We need Java." },
];
const assessment = {
  engine_version: "1.1.0",
  status: "completed",
  scores: [
    { id: "keyword_coverage", value: 100 },
    { id: "required_coverage", value: 100 },
    { id: "preferred_coverage", value: null },
    { id: "weighted_coverage", value: 100 },
  ],
  findings: [
    {
      term: "Java",
      aliases: [],
      importance: "required",
      status: "mentioned",
      resume_evidence: [{ start: 0, end: 4, text: "Java", context: "Java services", boxes: [] }],
    },
  ],
};
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolError) return error.code;
    throw error;
  }
  return "resolved";
};

afterEach(() => vi.unstubAllGlobals());

describe("stripMetadataBlock", () => {
  it("removes both header styles", () => {
    expect(
      stripMetadataBlock("TITLE: X\nREQ ID: 1\nAPPLY URL: https://a.example/x\n\nAbout the role…"),
    ).toMatch(/^About the role/);
    expect(stripMetadataBlock("jobReqId : 9\npostedOn : Posted Today\n\nWe build…")).toMatch(
      /^We build/,
    );
  });

  it("keeps a sentence that only looks like a header", () => {
    const jd = "Requirements: Java, Kafka and more.\nAbout us";
    expect(stripMetadataBlock(jd)).toBe(jd);
  });
});

describe("scoring service client", () => {
  it("sends reviewed terms without skipped ones and reads the assessment", async () => {
    const fetch = vi.fn().mockResolvedValue(json(assessment));
    vi.stubGlobal("fetch", fetch);
    const result = await assessLexical(Buffer.from("%PDF-1.4"), "a.pdf", "We need Java.", terms);
    expect(result.engine_version).toBe("1.1.0");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/assessments\/pdf$/);
    const metadata = JSON.parse((init.body as FormData).get("metadata") as string);
    expect(metadata.requirements).toEqual([
      { term: "Java", aliases: [], importance: "required", jd_quote: "We need Java." },
    ]);
  });

  it("retries once on 429", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "busy" }, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(json(assessment));
    vi.stubGlobal("fetch", fetch);
    await assessLexical(Buffer.from("%PDF-1.4"), "a.pdf", "We need Java.", terms);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports busy after a second 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "busy" }, 429, { "retry-after": "0" })),
    );
    expect(await code(assessLexical(Buffer.from("%PDF"), "a.pdf", "We need Java.", terms))).toBe(
      "busy",
    );
  });

  it("422 naming jd_quote maps to terms_stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(
          {
            error: "Invalid assessment request",
            issues: [{ location: ["requirements"] }],
            detail: "Each jd_quote must occur verbatim in job_description",
          },
          422,
        ),
      ),
    );
    expect(await code(assessLexical(Buffer.from("%PDF"), "a.pdf", "We need Java.", terms))).toBe(
      "terms_stale",
    );
  });

  it("a quote missing from the description is terms_stale before any request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await code(assessLexical(Buffer.from("%PDF"), "a.pdf", "We now need Go.", terms))).toBe(
      "terms_stale",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("an unassessable PDF maps to unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ ...assessment, status: "unable_to_assess" })),
    );
    expect(await code(assessLexical(Buffer.from("%PDF"), "a.pdf", "We need Java.", terms))).toBe(
      "unreadable",
    );
  });

  it("network error maps to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await code(suggestTerms("We need Java."))).toBe("unreachable");
  });
});

describe("ResumeNext client", () => {
  const input = {
    resumeText: "Asha",
    jobDescription: "We need Java.",
    targetRole: "Engineer",
    targetCompany: "Example",
  };

  it("refuses descriptions over 20,000 characters", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await code(matchResumeToJob({ ...input, jobDescription: "x".repeat(20_001) }))).toBe(
      "too_long",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads SSE frames and sends the session id", async () => {
    const sse = (body: unknown) =>
      new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
        headers: { "content-type": "text/event-stream" },
      });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          headers: { "content-type": "application/json", "mcp-session-id": "s-1" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        sse({
          jsonrpc: "2.0",
          id: 2,
          result: { structuredContent: { ats_score: 70, editor_url: "https://x" }, isError: false },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await matchResumeToJob(input);
    expect(result).toEqual({ ats_score: 70 });
    const call = fetch.mock.calls[2][1];
    expect(new Headers(call.headers).get("mcp-session-id")).toBe("s-1");
    expect(JSON.parse(call.body).params).toEqual({
      name: "match_resume_to_job",
      arguments: {
        resume_text: "Asha",
        job_description: "We need Java.",
        target_role: "Engineer",
        target_company: "Example",
      },
    });
  });

  it("an unreachable bridge maps to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await code(matchResumeToJob(input))).toBe("unreachable");
  });
});
