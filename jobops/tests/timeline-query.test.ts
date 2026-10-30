import { describe, expect, it } from "vitest";
import { mailHref, parseMailQuery, type MailQuery } from "@/features/timeline/query";

const app = "11111111-1111-4111-8111-111111111111";
const mailId = "22222222-2222-4222-8222-222222222222";
const aliases: Record<string, string> = { "Acme Labs": "acme", ACME: "acme" };
const resolve = (name: string) => aliases[name] ?? name.trim().toLowerCase();
const roleCompany = (id: string) => (id === app ? "acme" : undefined);
const parse = (raw: Record<string, string | undefined>) =>
  parseMailQuery(raw, resolve, roleCompany);
const empty: MailQuery = {
  company: null,
  home: false,
  tag: null,
  q: null,
  role: null,
  mail: null,
  cursor: null,
};

describe("mail query", () => {
  it("resolves a company name or alias to its key", () => {
    expect(parse({ company: "Acme Labs" })).toEqual({ ...empty, company: "acme" });
    expect(parse({ company: "ACME" }).company).toBe("acme");
    expect(parse({ company: "  " }).company).toBeNull();
  });

  it("maps application to its company and role", () => {
    expect(parse({ application: app })).toEqual({ ...empty, company: "acme", role: app });
    expect(parse({ role: app })).toEqual({ ...empty, company: "acme", role: app });
    expect(parse({ application: "not-a-uuid" })).toEqual(empty);
  });

  it("drops view and unknown tags", () => {
    expect(parse({ view: "all", tag: "spam", company: "acme" })).toEqual({
      ...empty,
      company: "acme",
    });
    expect(parse({ tag: "offer", q: "  round  ", mail: "nope" })).toEqual({
      ...empty,
      tag: "offer",
      q: "round",
    });
  });

  it("home view", () => {
    expect(parse({ view: "home", company: "acme", mail: mailId })).toEqual({
      ...empty,
      home: true,
      mail: mailId,
    });
  });

  it("round-trips through mailHref", () => {
    const query: MailQuery = {
      company: "acme labs",
      home: false,
      tag: "process",
      q: "next round",
      role: app,
      mail: mailId,
      cursor: `2026-10-30T10:00:00.000Z|${mailId}`,
    };
    const href = mailHref(query);
    expect(href.startsWith("/mail?company=acme+labs&role=")).toBe(true);
    const raw = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(
      parseMailQuery(
        raw,
        (name) => name,
        () => undefined,
      ),
    ).toEqual(query);
    expect(mailHref({})).toBe("/mail");
    expect(mailHref({ home: true, mail: mailId })).toBe(`/mail?view=home&mail=${mailId}`);
  });
});
