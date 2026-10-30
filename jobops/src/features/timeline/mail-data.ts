import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companyRecords } from "@/db/schema";
import type { CompanyMailRule } from "@/features/mail/company-rules";
import { companyKeyFor, loadMailContext } from "@/features/mail/context";
import { readInboxes, type Inboxes } from "@/features/mail/inboxes";
import type { MailItem } from "@/features/mail/mail-item";
import type { TimelineDay } from "./entries";
import type { PlaceOptions } from "./handling";
import type { RailRow } from "./index-rows";
import { mailHref, parseMailQuery, type MailQuery } from "./query";
import {
  readCompanyIndex,
  readCompanyTimeline,
  readHomeMail,
  type CompanyIndex,
  type TagCounts,
} from "./read";
import { suggestHandling, type Handling } from "./suggest";

type PaneTimeline = {
  days: TimelineDay[];
  handling: Record<string, Handling>;
  olderHref: string | null;
  newestHref: string | null;
  tags: TagCounts;
};
export type MailPane =
  | (PaneTimeline & {
      kind: "company";
      company: { key: string; name: string; slug: string | null; city: string };
      row: RailRow | null;
      roles: { id: string; role: string; href: string }[];
      allRolesHref: string;
      rule: { company: string; rule: CompanyMailRule; source: string } | null;
    })
  | (PaneTimeline & { kind: "home" })
  | { kind: "empty" };
export type MailViewData = {
  query: MailQuery;
  index: CompanyIndex;
  pane: MailPane;
  placeOptions: PlaceOptions;
  inboxes: Inboxes;
  lastChecked: string | null;
  notice: string | null;
};

const openMail = (days: TimelineDay[]) =>
  days.flatMap((day) =>
    day.entries.flatMap((entry) =>
      entry.type === "mail" && entry.item.attention === "open" ? [entry.item] : [],
    ),
  );
const handlingFor = (items: MailItem[], handle: (item: MailItem) => Handling) =>
  Object.fromEntries(items.map((item) => [item.id, handle(item)]));

/**
 * Everything `/mail` shows: the rail, then one company's timeline (the URL's, else the
 * first that needs you), Needs a home, or nothing to do.
 */
export async function readMailView(
  raw: Record<string, string | undefined>,
  now = new Date(),
): Promise<MailViewData> {
  const [context, records, inboxes] = await Promise.all([
    loadMailContext(),
    db
      .select({ name: companyRecords.name, aliases: companyRecords.aliases })
      .from(companyRecords)
      .where(eq(companyRecords.status, "ACTIVE")),
    readInboxes(),
  ]);
  const companyOf = new Map(context.applications.map((app) => [app.id, app.company]));
  const query = parseMailQuery(
    raw,
    (name) => companyKeyFor(name, records),
    (id) => companyOf.get(id),
  );
  const filters = { tag: query.tag ?? undefined, q: query.q ?? undefined };
  const index = await readCompanyIndex(filters, now);
  const filtered = Boolean(query.tag || query.q);
  const key = query.home
    ? null
    : (query.company ??
      (index.rows.find((row) => row.group === "needs") ?? (filtered ? index.rows[0] : undefined))
        ?.key ??
      null);
  // Paging and an opened email belong to one view; filters and the company carry over.
  const at = (change: Partial<MailQuery>) =>
    mailHref({ ...query, company: key, mail: null, cursor: null, ...change });
  const paging = (nextCursor: string | null) => ({
    olderHref: nextCursor ? at({ cursor: nextCursor }) : null,
    newestHref: query.cursor ? at({}) : null,
  });
  let pane: MailPane = { kind: "empty" };
  if (query.home) {
    const home = await readHomeMail({ ...filters, cursor: query.cursor ?? undefined }, now);
    pane = {
      kind: "home",
      days: home.days,
      handling: handlingFor(openMail(home.days), (item) => suggestHandling(item, [])),
      tags: home.tags,
      ...paging(home.nextCursor),
    };
  } else if (key) {
    const timeline = await readCompanyTimeline(
      key,
      { ...filters, application: query.role ?? undefined, cursor: query.cursor ?? undefined },
      now,
    );
    const listed = context.companies.find((company) => company.id === key);
    pane = {
      kind: "company",
      company: timeline.company,
      row: index.rows.find((row) => row.key === key) ?? null,
      days: timeline.days,
      handling: handlingFor(openMail(timeline.days), (item) =>
        suggestHandling(item, timeline.roles),
      ),
      roles: timeline.roles.map((role) => ({
        id: role.id,
        role: role.role,
        href: at({ role: role.id }),
      })),
      allRolesHref: at({ role: null }),
      rule: listed ? { company: listed.id, rule: listed.rule, source: listed.ruleSource } : null,
      tags: timeline.tags,
      ...paging(timeline.nextCursor),
    };
  }
  const names = new Map(context.companies.map((company) => [company.id, company.name]));
  const checked = inboxes.connections.flatMap((row) => (row.lastChecked ? [row.lastChecked] : []));
  return {
    query,
    index,
    pane,
    placeOptions: {
      companies: context.companies.map((company) => ({ key: company.id, name: company.name })),
      applications: context.applications.map((app) => ({
        id: app.id,
        label: `${names.get(app.company) ?? app.company}, ${app.role}`,
      })),
    },
    inboxes,
    lastChecked: checked.sort().at(-1) ?? null,
    notice: raw.notice?.slice(0, 300) || null,
  };
}
