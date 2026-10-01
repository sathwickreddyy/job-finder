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

describe("trusted local-network access", () => {
  function request(host: string, path = "/api/v1/companies", init: RequestInit = {}) {
    return new NextRequest(`http://${host}${path}`, {
      ...init,
      headers: { host, ...Object.fromEntries(new Headers(init.headers)) },
    });
  }

  function localMode() {
    vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "");
  }

  it.each([
    "localhost",
    "127.0.0.1",
    "127.0.0.2",
    "10.0.0.1",
    "10.255.255.254",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.0.1",
    "192.168.255.254",
    "[::1]",
    "[fc00::1]",
    "[fdff::1]",
    "[fe80::1]",
    "[febf::1]",
  ])("accepts local target %s with no token or Origin", (hostname) => {
    localMode();
    expect(proxy(request(`${hostname}:3210`, "/api/v1/companies", { method: "POST" })).status).toBe(
      200,
    );
    expect(proxy(request(`${hostname}:3210`, "/companies")).status).toBe(200);
  });

  it.each([
    "8.8.8.8",
    "172.15.255.254",
    "172.32.0.1",
    "192.169.0.1",
    "100.64.0.1",
    "169.254.1.1",
    "0.0.0.0",
    "10.0.0.1.evil.example",
    "router.local",
    "[2001:db8::1]",
    "[fe7f::1]",
    "[fec0::1]",
    "[ff00::1]",
  ])("rejects nonlocal alias %s", (hostname) => {
    localMode();
    expect(proxy(request(`${hostname}:3210`)).status).toBe(403);
  });

  it("requires the configured port and a local APP_URL for LAN aliases", () => {
    localMode();
    expect(proxy(request("192.168.1.10:3211")).status).toBe(403);
    vi.stubEnv("APP_URL", "http://192.168.1.11:3210");
    expect(proxy(request("192.168.1.10:3210")).status).toBe(200);
    vi.stubEnv("APP_URL", "https://career.example");
    expect(proxy(request("192.168.1.10:3210")).status).toBe(403);
  });

  it("accepts browser writes only from the actual local target origin", () => {
    localMode();
    const host = "192.168.1.10:3210";
    expect(
      proxy(
        request(host, "/companies", {
          method: "POST",
          headers: { origin: `http://${host}` },
        }),
      ).status,
    ).toBe(200);
    for (const origin of [
      "http://127.0.0.1:3210",
      "http://192.168.1.11:3210",
      "https://evil.example",
      "null",
    ]) {
      expect(
        proxy(
          request(host, "/api/v1/companies", {
            method: "POST",
            headers: { origin },
          }),
        ).status,
      ).toBe(403);
    }
  });

  it("rejects foreign browser origins on company reads as well as writes", () => {
    localMode();
    expect(
      proxy(
        request("192.168.1.10:3210", "/api/v1/companies", {
          headers: { origin: "https://evil.example" },
        }),
      ).status,
    ).toBe(403);
  });

  it("rejects malformed Host authorities rather than parsing a private address out of them", () => {
    localMode();
    for (const host of [
      "user@192.168.1.10:3210",
      "192.168.1.10:3210/path",
      "192.168.1.10:3210?query",
      "192.168.1.10:3210#fragment",
    ]) {
      expect(
        proxy(
          new NextRequest("http://127.0.0.1:3210/api/v1/companies", {
            headers: { host },
          }),
        ).status,
      ).toBe(400);
    }
  });

  it("limits missing-Origin writes to company API routes and the retired task API", () => {
    localMode();
    for (const path of [
      "/api/v1/companies",
      "/api/v1/companies/batch",
      "/api/v1/companies/phonepe",
      "/api/v1/tasks/123abc/updates",
    ]) {
      expect(proxy(request("192.168.1.10:3210", path, { method: "POST" })).status).toBe(200);
    }
    for (const path of [
      "/companies",
      "/api/export",
      "/api/v1/companies-extra",
      "/api/v1/companies/phonepe/extra",
    ]) {
      expect(proxy(request("192.168.1.10:3210", path, { method: "POST" })).status).toBe(403);
    }
  });

  it("does not allow server actions to use company API origin exemptions", () => {
    localMode();
    for (const path of [
      "/api/v1/companies",
      "/api/v1/companies/batch",
      "/api/v1/companies/phonepe",
    ]) {
      expect(
        proxy(
          request("192.168.1.10:3210", path, {
            method: "POST",
            headers: { "next-action": "action-id", origin: "http://192.168.1.10:3210" },
          }),
        ).status,
      ).toBe(403);
    }
  });

  it("keeps browser protection while allowing local company curl with an access token configured", () => {
    localMode();
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "0123456789abcdef0123456789abcdef");
    expect(
      proxy(request("192.168.1.10:3210", "/api/v1/companies", { method: "POST" })).status,
    ).toBe(200);
    expect(proxy(request("192.168.1.10:3210", "/companies")).status).toBe(307);
    expect(proxy(request("192.168.1.10:3210", "/api/export")).status).toBe(401);
  });

  it("retains access-token and origin requirements for public company API deployments", () => {
    vi.stubEnv("APP_URL", "https://career.example");
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "");
    const publicRequest = () =>
      new NextRequest("https://career.example/api/v1/companies", {
        headers: { host: "career.example" },
      });
    expect(proxy(publicRequest()).status).toBe(503);
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "0123456789abcdef0123456789abcdef");
    expect(proxy(publicRequest()).status).toBe(401);
    const authorized = publicRequest();
    authorized.cookies.set(accessCookie, credentialDigest(process.env.JOBOPS_ACCESS_TOKEN!));
    expect(proxy(authorized).status).toBe(200);
    expect(
      proxy(
        new NextRequest("https://career.example/api/v1/companies", {
          method: "POST",
          headers: { host: "career.example" },
        }),
      ).status,
    ).toBe(403);
  });

  it("rejects weak configured tokens and ignores forwarded-host spoofing", () => {
    localMode();
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "short");
    expect(proxy(request("192.168.1.10:3210")).status).toBe(503);
    vi.stubEnv("JOBOPS_ACCESS_TOKEN", "");
    expect(
      proxy(
        request("evil.example:3210", "/api/v1/companies", {
          headers: { "x-forwarded-host": "192.168.1.10:3210", "x-forwarded-for": "127.0.0.1" },
        }),
      ).status,
    ).toBe(403);
    expect(
      proxy(
        request("192.168.1.10:3210", "/api/v1/companies", {
          method: "POST",
          headers: { origin: "https://evil.example", "x-forwarded-host": "evil.example" },
        }),
      ).status,
    ).toBe(403);
  });
});
