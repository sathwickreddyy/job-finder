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

export function withNotice(path: string, notice: string) {
  const url = new URL(path, BASE);
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}
