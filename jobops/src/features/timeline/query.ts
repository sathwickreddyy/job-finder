import { z } from "zod";
import { tagFromParam, type MailTag } from "@/features/mail/tags";

/** `<receivedAt ISO>|<id>`, the position after the last email of a page. */
export const mailCursor = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\|[0-9a-f-]{36}$/i)
  .refine((value) => Number.isFinite(Date.parse(value.split("|")[0])));

/** What `/mail` shows: one company (or Needs a home), narrowed by tag, search and role. */
export type MailQuery = {
  company: string | null;
  home: boolean;
  tag: MailTag | null;
  q: string | null;
  role: string | null;
  mail: string | null;
  cursor: string | null;
};

const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? value! : null);

/**
 * Reads `/mail` search params. `company` accepts a name or alias; the old `application`
 * becomes its company plus `role`; the old `view` values other than `home` are dropped.
 */
export function parseMailQuery(
  raw: Record<string, string | undefined>,
  resolve: (name: string) => string,
  roleCompany: (applicationId: string) => string | undefined,
): MailQuery {
  const home = raw.view === "home";
  const role = uuid(raw.role) ?? uuid(raw.application);
  const named = raw.company?.trim() ? resolve(raw.company.trim()) : null;
  const q = raw.q?.trim().slice(0, 200);
  return {
    company: home ? null : (named ?? (role ? (roleCompany(role) ?? null) : null)),
    home,
    tag: raw.tag ? tagFromParam(raw.tag) : null,
    q: q || null,
    role: home ? null : role,
    mail: uuid(raw.mail),
    cursor: mailCursor.safeParse(raw.cursor).success ? raw.cursor! : null,
  };
}

/** The `/mail` URL for a query; unset parts are left out. */
export function mailHref(query: Partial<MailQuery>) {
  const params = new URLSearchParams();
  if (query.home) params.set("view", "home");
  else if (query.company) params.set("company", query.company);
  if (query.role && !query.home) params.set("role", query.role);
  if (query.tag) params.set("tag", query.tag);
  if (query.q) params.set("q", query.q);
  if (query.mail) params.set("mail", query.mail);
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.toString();
  return search ? `/mail?${search}` : "/mail";
}
