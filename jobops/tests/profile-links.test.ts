import { describe, expect, it } from "vitest";
import { previewTargets } from "@/features/workspace/embeds";
import { linkedInBadgeDocument, profileLinks } from "@/features/workspace/profile-links";

describe("profile links", () => {
  const links = profileLinks([
    { name: "Medium", url: "https://medium.com/@writer" },
    { name: "Portfolio", url: "https://writer.github.io/site/" },
    { name: "GitHub", url: "https://github.com/writer" },
    { name: "LinkedIn", url: "https://www.linkedin.com/in/writer-vanity/" },
    { name: "Naukri", url: "https://www.naukri.com/mnjuser/profile" },
  ]);

  it("orders LinkedIn, GitHub, Portfolio, Medium, then other sites", () => {
    expect(links.map((link) => link.kind)).toEqual([
      "linkedin",
      "github",
      "portfolio",
      "medium",
      "other",
    ]);
  });
  it("derives a readable handle for each kind", () => {
    expect(links.map((link) => link.handle)).toEqual([
      "writer-vanity",
      "writer",
      "writer.github.io/site",
      "@writer",
      "naukri.com/mnjuser/profile",
    ]);
    expect(links[0].host).toBe("linkedin.com");
  });
  it("treats any link named Portfolio as the portfolio", () => {
    expect(profileLinks([{ name: "Portfolio 2", url: "https://example.invalid/me" }])[0].kind).toBe(
      "portfolio",
    );
  });
  it("preserves repeated saved URLs with distinct stable chip and preview keys", () => {
    const site = { name: "Portfolio", url: "https://portfolio.example.invalid/" };
    const links = profileLinks([site, site, { ...site, name: "Project portfolio" }]);
    expect(links).toHaveLength(3);
    expect(new Set(links.map((link) => link.key)).size).toBe(3);
    expect(new Set(previewTargets(links, null).map((target) => target.key)).size).toBe(3);
    const withAnother = profileLinks([
      { name: "Other", url: "https://other.example.invalid/" },
      site,
      site,
      { ...site, name: "Project portfolio" },
    ]);
    expect(withAnother.filter((link) => link.url === site.url).map((link) => link.key)).toEqual(
      links.map((link) => link.key),
    );
  });
  it("skips missing, malformed and non-web links instead of failing", () => {
    expect(
      profileLinks([
        { name: "Empty", url: null },
        { name: "Broken", url: "https://" },
        { name: "Mail", url: "mailto:me@example.invalid" },
      ]),
    ).toEqual([]);
  });
});

describe("LinkedIn badge document", () => {
  it("cannot be used to inject markup through the vanity name", () => {
    const html = linkedInBadgeDocument('x"><script>alert(1)</script>', "dark");
    expect(html).toContain('data-vanity="xscriptalert1script"');
    expect(html.match(/<script/g)).toHaveLength(2);
  });
  it("follows the app theme and reports back to the parent", () => {
    const html = linkedInBadgeDocument("writer-vanity", "light");
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('type:"linkedin-badge"');
  });
});
