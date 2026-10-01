// Public profile links and the public embeds Home shows for them. Nothing here invents metrics.

export type LinkKind = "linkedin" | "github" | "portfolio" | "medium" | "other";
export type ProfileLink = {
  key: string;
  kind: LinkKind;
  name: string;
  url: string;
  handle: string;
  host: string;
};

const linkOrder: LinkKind[] = ["linkedin", "github", "portfolio", "medium", "other"];

export function profileLinks(sites: { name: string; url: string | null }[]): ProfileLink[] {
  const occurrences = new Map<string, number>();
  const links: ProfileLink[] = sites.flatMap((site) => {
    if (!site.url) return [];
    let url: URL;
    try {
      url = new URL(site.url);
    } catch {
      return [];
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const host = url.hostname.replace(/^www\./, "");
    const kind: LinkKind = /(^|\.)linkedin\.com$/.test(host)
      ? "linkedin"
      : host === "github.com"
        ? "github"
        : /(^|\.)medium\.com$/.test(host)
          ? "medium"
          : /portfolio/i.test(site.name) || host.endsWith("github.io")
            ? "portfolio"
            : "other";
    const segments = url.pathname.split("/").filter(Boolean);
    const handle =
      kind === "linkedin"
        ? (segments[1] ?? host)
        : kind === "github" || kind === "medium"
          ? (segments[0] ?? host)
          : `${host}${url.pathname.replace(/\/$/, "")}`;
    // Multiple stored records can point to one URL; preserve each without sharing React state.
    const signature = JSON.stringify([site.name, site.url]);
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);
    const key = JSON.stringify([site.name, site.url, occurrence]);
    return [{ key, kind, name: site.name, url: site.url, handle, host }];
  });
  return links.sort((a, b) => linkOrder.indexOf(a.kind) - linkOrder.indexOf(b.kind));
}

export const favicon = (host: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
export const githubAvatar = (handle: string) =>
  `https://github.com/${encodeURIComponent(handle)}.png?size=160`;
// Third-party SVG cannot read CSS tokens; this is the light-theme --primary value.
export const contributionChart = (handle: string) =>
  `https://ghchart.rshah.org/1a73e8/${encodeURIComponent(handle)}`;

/** The LinkedIn badge page, run in a sandboxed iframe so LinkedIn's script never runs in JobOps. */
export function linkedInBadgeDocument(vanity: string, theme: "light" | "dark") {
  const safeVanity = vanity.replace(/[^A-Za-z0-9_%-]/g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;background:transparent}body{display:grid;place-items:center;font-family:system-ui,sans-serif}</style></head><body><div class="badge-base LI-profile-badge" data-locale="en_US" data-size="large" data-theme="${theme}" data-type="HORIZONTAL" data-vanity="${safeVanity}" data-version="v1"></div><script src="https://platform.linkedin.com/badges/js/profile.js" async defer></script><script>setTimeout(function(){parent.postMessage({type:"linkedin-badge",ok:!!document.querySelector(".LI-profile-badge iframe")},"*")},6000)</script></body></html>`;
}
