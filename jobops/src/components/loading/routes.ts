// Decides which clicks and form submits are in-app page changes, and how to name them.

const pageLabels: Record<string, string> = {
  "": "Home",
  find: "Find openings",
  jobs: "Jobs",
  resumes: "Resumes",
  "resume-prompt": "Resume review",
  companies: "Companies",
  applications: "Applications",
  inbox: "Inbox",
  mail: "Inbox",
  "my-profile": "My profile",
  "profile-prompt": "Profile prompt",
  contacts: "Contacts",
  outreach: "Outreach",
  opportunities: "Opportunities",
  settings: "Settings",
  import: "Import",
  today: "Today",
  profiles: "Profiles",
  gallery: "Gallery",
};

export function labelForPath(pathname: string) {
  const page = pageLabels[pathname.split("/")[1] ?? ""];
  return page ? `Opening ${page}` : "Loading";
}

type Here = { href: string };
type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};
type AnchorLike = { href: string; target: string; hasAttribute(name: string): boolean };
type FormLike = { action: string; method: string; target: string };

function appUrl(href: string, here: Here) {
  let url: URL;
  try {
    url = new URL(href, here.href);
  } catch {
    return null;
  }
  if (url.origin !== new URL(here.href).origin || url.pathname.startsWith("/api/")) return null;
  return url;
}

/** True when the URL is a different page or query from the current one; hashes are ignored. */
export function isNewLocation(href: string, here: Here) {
  const url = new URL(href, here.href);
  const current = new URL(here.href);
  return url.pathname !== current.pathname || url.search !== current.search;
}

export function navigationTarget(click: ClickLike, anchor: AnchorLike, here: Here) {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey)
    return null;
  if (anchor.hasAttribute("download") || anchor.hasAttribute("data-no-loading")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = appUrl(anchor.href, here);
  return url && isNewLocation(url.href, here) ? url : null;
}

export function formNavigationTarget(form: FormLike, here: Here) {
  if (form.method.toLowerCase() !== "get") return null;
  if (form.target && form.target !== "_self") return null;
  return appUrl(form.action, here);
}
