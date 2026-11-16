const BASE = "http://jobops.invalid";

/** Only same-app Applications paths may follow an action; anything else falls back. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return null;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (url.pathname !== "/applications" && !url.pathname.startsWith("/applications/")) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * An application's open row on its company page (`/companies/<key>?open=<id>`), where an outcome
 * recorded from an email or a link returns to drop that email from the URL without leaving the
 * page. Any other path, query or origin is refused.
 */
export function safeRowReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/companies/") || value.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  const open = url.searchParams.get("open");
  if (url.origin !== BASE || url.pathname.split("/").length !== 3 || url.pathname.includes(".."))
    return null;
  if (!open || !/^[0-9a-f-]{36}$/i.test(open) || [...url.searchParams.keys()].length !== 1)
    return null;
  return `${url.pathname}?open=${open}`;
}

export function withNotice(path: string, notice: string) {
  const url = new URL(path, BASE);
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}
