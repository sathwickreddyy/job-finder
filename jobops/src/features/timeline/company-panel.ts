import { z } from "zod";
import { ApiError } from "@/features/agent-api/http";
import type { CompanyStatus } from "@/features/companies/status";
import { readCompanySearch } from "@/features/mail/company-search";
import type { TimelineDay } from "./entries";
import type { RailDue } from "./index-rows";
import { mailCursor } from "./query";
import { readCompanyIndex, readCompanyTimeline } from "./read";
import { suggestHandling, type Handling } from "./suggest";

export type CompanyTimelinePanel = {
  days: TimelineDay[];
  handling: Record<string, Handling>;
  roles: { id: string; role: string; href: string }[];
  allRolesHref: string;
  role: string | null;
  olderHref: string | null;
  newestHref: string | null;
  next: { text: string; due: RailDue | null } | null;
  status: CompanyStatus | null;
  /** The company search panel's data; null when the company has no mail rule to show. */
  search: Awaited<ReturnType<typeof readCompanySearch>> | null;
};

/** The company page's timeline: the same reader and next step as Mail, linked back to itself. */
export async function readCompanyPanel(
  key: string,
  raw: { role?: string; cursor?: string },
  href: (change: { role: string | null; cursor: string | null }) => string,
  now = new Date(),
): Promise<CompanyTimelinePanel> {
  const role = z.uuid().safeParse(raw.role).success ? raw.role! : null;
  const cursor = mailCursor.safeParse(raw.cursor).success ? raw.cursor! : null;
  const [timeline, index, search] = await Promise.all([
    readCompanyTimeline(key, { application: role ?? undefined, cursor: cursor ?? undefined }, now),
    readCompanyIndex({}, now),
    readCompanySearch(key).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
  ]);
  const row = index.rows.find((item) => item.key === key);
  return {
    days: timeline.days,
    handling: Object.fromEntries(
      timeline.days.flatMap((day) =>
        day.entries.flatMap((entry) =>
          entry.type === "mail" && entry.item.attention === "open"
            ? [[entry.item.id, suggestHandling(entry.item, timeline.roles)]]
            : [],
        ),
      ),
    ),
    roles: timeline.roles.map((item) => ({
      id: item.id,
      role: item.role,
      href: href({ role: item.id, cursor: null }),
    })),
    allRolesHref: href({ role: null, cursor: null }),
    role,
    olderHref: timeline.nextCursor ? href({ role, cursor: timeline.nextCursor }) : null,
    newestHref: cursor ? href({ role, cursor: null }) : null,
    next: row?.next ? { text: row.next, due: row.due } : null,
    status: index.statuses[key] ?? null,
    search,
  };
}
