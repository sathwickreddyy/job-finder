import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companyRecords } from "@/db/schema";
import type { CompanyMailRule } from "@/features/mail/company-rules";
import { companyKeyFor, loadMailContext } from "@/features/mail/context";
import { readInboxes, type Inboxes } from "@/features/mail/inboxes";
import type { MailItem } from "@/features/mail/mail-item";
import { readMailItem } from "@/features/mail/mail-list";
import type { CompanyStatus } from "@/features/companies/status";
import type { ComingUpItem } from "./coming-up";
import type { TimelineDay } from "./entries";
import type { PlaceOptions } from "./handling";
import type { RailRow } from "./index-rows";
import { mailHref, parseMailQuery, type MailQuery } from "./query";
import {
  readAllMail,
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
  | (PaneTimeline & { kind: "all" })
  | { kind: "empty" };
export type MailViewData = {
  /** What is shown, including the default company the URL left out. */
  query: MailQuery;
  /** The URL named the company or Needs a home; on a phone the pane replaces the rail. */
  pinned: boolean;
  index: CompanyIndex;
  pane: MailPane;
  placeOptions: PlaceOptions;
  inboxes: Inboxes;
  lastChecked: string | null;
  notice: string | null;
  /** What is due in the next week, above the feed. */
  comingUp: ComingUpItem[];
  /** One derived status per company key, for the rail and pane header. */
  statuses: Record<string, CompanyStatus>;
};

const openMail = (days: TimelineDay[]) =>
  days.flatMap((day) =>
    day.entries.flatMap((entry) =>
      entry.type === "mail" && entry.item.attention === "open" ? [entry.item] : [],
    ),
  );
const handlingFor = (items: MailItem[], handle: (item: MailItem) => Handling) =>
  Object.fromEntries(items.map((item) => [item.id, handle(item)]));
const hasMail = (days: TimelineDay[], id: string) =>
  days.some((day) => day.entries.some((entry) => entry.type === "mail" && entry.item.id === id));
/** A cursor just after an email, so the page it opens starts at that email. */
const cursorAt = (item: MailItem) =>
  `${new Date(Date.parse(item.receivedAt) + 1).toISOString()}|00000000-0000-0000-0000-000000000000`;

/**
 * Everything `/mail` shows: the rail, then All job mail (the default), one company's
 * timeline, Needs a home, or nothing to do.
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
  const { statuses, comingUp, ...index } = await readCompanyIndex(filters, now);
  const home = query.home;
  const key = home ? null : query.company;
  /**
   * Reads a page; an email named in the URL but older than the newest page opens the page
   * that starts at it.
   */
  async function page<T extends { days: TimelineDay[] }>(
    read: (cursor: string | undefined) => Promise<T>,
    belongs: (item: MailItem) => boolean,
  ) {
    let cursor = query.cursor;
    let data = await read(cursor ?? undefined);
    if (query.mail && !cursor && !hasMail(data.days, query.mail)) {
      const item = await readMailItem(query.mail, context).catch(() => null);
      if (item && belongs(item)) {
        cursor = cursorAt(item);
        data = await read(cursor);
      }
    }
    return { data, cursor };
  }
  let shown: MailQuery = { ...query, home, company: key };
  // Paging and an opened email belong to one view; filters and the company carry over.
  const at = (change: Partial<MailQuery>) =>
    mailHref({ ...shown, mail: null, cursor: null, ...change });
  const paging = (nextCursor: string | null, cursor: string | null) => ({
    olderHref: nextCursor ? at({ cursor: nextCursor }) : null,
    newestHref: cursor ? at({}) : null,
  });
  let pane: MailPane = { kind: "empty" };
  if (!home && !key) {
    const { data, cursor } = await page(
      (cursor) => readAllMail({ ...filters, cursor }, now),
      () => true,
    );
    shown = { ...shown, cursor, all: true };
    if (data.days.length || cursor)
      pane = {
        kind: "all",
        days: data.days,
        handling: handlingFor(openMail(data.days), (item) => suggestHandling(item, [])),
        tags: data.tags,
        ...paging(data.nextCursor, cursor),
      };
  } else if (home) {
    const { data, cursor } = await page(
      (cursor) => readHomeMail({ ...filters, cursor }, now),
      (item) => !item.company && !item.application,
    );
    shown = { ...shown, cursor };
    pane = {
      kind: "home",
      days: data.days,
      handling: handlingFor(openMail(data.days), (item) => suggestHandling(item, [])),
      tags: data.tags,
      ...paging(data.nextCursor, cursor),
    };
  } else if (key) {
    const { data: timeline, cursor } = await page(
      (cursor) =>
        readCompanyTimeline(key, { ...filters, application: query.role ?? undefined, cursor }, now),
      (item) => item.company?.key === key,
    );
    shown = { ...shown, cursor };
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
      ...paging(timeline.nextCursor, cursor),
    };
  }
  const names = new Map(context.companies.map((company) => [company.id, company.name]));
  const checked = inboxes.connections.flatMap((row) => (row.lastChecked ? [row.lastChecked] : []));
  return {
    query: shown,
    pinned: Boolean(query.company || query.home || query.all),
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
    comingUp,
    statuses,
  };
}
