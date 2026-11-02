import { ToolError, toolErrorCopy } from "./tool-error";

// ResumeNext's match_resume_to_job through the personal-mcps bridge (MCP streamable HTTP).
// This sends the résumé text and the job description to resumenext.io.
const url = () => process.env.RESUMENEXT_MCP_URL ?? "http://127.0.0.1:8004/mcp";
const TIMEOUT_MS = 60_000;
export const RESUMENEXT_MAX_JD = 20_000;

const HEADER = /^\s*[A-Za-z][\w .-]{0,29}\s?:\s*\S.*$/;

/** Drops the leading `key: value` block saved descriptions start with; stops at the first other line. */
export function stripMetadataBlock(jd: string): string {
  const lines = jd.split("\n");
  let i = 0;
  let header = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    // A sentence ("Requirements: Java, Kafka and more.") is content, not a header.
    const sentence = /[.!?]$/.test(value) || /,\s/.test(value);
    if (!HEADER.test(line) || key.trim().length > 30 || sentence) break;
    header = true;
  }
  return header ? lines.slice(i).join("\n").trimStart() : jd;
}

type RpcBody = { result?: Record<string, unknown>; error?: { message?: string } };

function readRpc(text: string, contentType: string | null): RpcBody {
  if (contentType?.includes("text/event-stream")) {
    const frames = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    return JSON.parse(frames.at(-1) ?? "{}");
  }
  return text ? JSON.parse(text) : {};
}

export async function matchResumeToJob(input: {
  resumeText: string;
  jobDescription: string;
  targetRole: string;
  targetCompany: string;
}): Promise<unknown> {
  if (input.jobDescription.length > RESUMENEXT_MAX_JD)
    throw new ToolError("too_long", toolErrorCopy.tooLong);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const post = async (body: unknown) => {
    try {
      return await fetch(url(), {
        method: "POST",
        headers: { ...headers },
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      throw new ToolError("unreachable", toolErrorCopy.resumeNextUnreachable);
    }
  };
  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "jobops", version: "1" },
    },
  });
  if (!init.ok) throw new ToolError("unreachable", toolErrorCopy.resumeNextUnreachable);
  const session = init.headers.get("mcp-session-id");
  if (session) headers["mcp-session-id"] = session;
  await init.text();
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  const response = await post({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "match_resume_to_job",
      arguments: {
        resume_text: input.resumeText,
        job_description: input.jobDescription,
        target_role: input.targetRole,
        target_company: input.targetCompany,
      },
    },
  });
  if (!response.ok) throw new ToolError("unreachable", toolErrorCopy.resumeNextUnreachable);
  let rpc: RpcBody;
  try {
    rpc = readRpc(await response.text(), response.headers.get("content-type"));
  } catch {
    throw new ToolError("failed", toolErrorCopy.failed("ResumeNext"));
  }
  const structured = rpc.result?.structuredContent as Record<string, unknown> | undefined;
  if (rpc.error || rpc.result?.isError || !structured)
    throw new ToolError("failed", toolErrorCopy.failed("ResumeNext"));
  // The editor link is a private copy ResumeNext offers; it isn't part of the score.
  const { editor_url: _, ...result } = structured;
  return result;
}
