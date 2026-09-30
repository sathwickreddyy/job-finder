import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { POST as unlock } from "@/app/api/unlock/route";
import { accessCookie, credentialDigest } from "@/lib/security";
afterEach(() => vi.unstubAllEnvs());
describe("single-user access boundary", () => {
  it("allows local reads but rejects unexpected hosts", () => {
    vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "");
    expect(
      proxy(new NextRequest("http://127.0.0.1:3210/jobs", { headers: { host: "127.0.0.1:3210" } }))
        .status,
    ).toBe(200);
    expect(
      proxy(new NextRequest("http://evil.example/jobs", { headers: { host: "evil.example" } }))
        .status,
    ).toBe(403);
  });
  it("rejects cross-origin mutations even in local mode", () => {
    vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
    expect(
      proxy(
        new NextRequest("http://127.0.0.1:3210/jobs", {
          method: "POST",
          headers: { host: "127.0.0.1:3210", origin: "https://evil.example" },
        }),
      ).status,
    ).toBe(403);
  });
  it("requires protection beyond loopback", () => {
    vi.stubEnv("APP_URL", "https://career.example");
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "");
    expect(
      proxy(new NextRequest("https://career.example/", { headers: { host: "career.example" } }))
        .status,
    ).toBe(503);
  });
  it("protects JSON context and downloads with the same access cookie", () => {
    vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "0123456789abcdef0123456789abcdef");
    for (const url of [
      "/missions/1/context.json",
      "/api/export?entity=jobs",
      "/api/resumes/1/file",
    ]) {
      const request = new NextRequest(`http://127.0.0.1:3210${url}`, {
        headers: { host: "127.0.0.1:3210" },
      });
      expect(proxy(request).status).toBe(401);
      request.cookies.set(accessCookie, credentialDigest(process.env.JOBOPS_ACCESS_TOKEN!));
      expect(proxy(request).status).toBe(200);
    }
  });
  it("allows authenticated Google return navigation with a Lax HttpOnly cookie", async () => {
    vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "0123456789abcdef0123456789abcdef");
    const response = await unlock(
      new NextRequest("http://127.0.0.1:3210/api/unlock", {
        method: "POST",
        body: new URLSearchParams({ token: process.env.JOBOPS_ACCESS_TOKEN! }),
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
  });
});
