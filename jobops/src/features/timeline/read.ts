import { and, count, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { mailEvents, mailMessages } from "@/db/schema";
import { buildLanes, pendingMailFrom } from "@/features/applications/lanes";
import { recordStateFrom, type Phase, type RecordState } from "@/features/applications/phase";
import { istDaysBetween } from "@/features/applications/dates";
import { buildQueue, type QueueItem } from "@/features/applications/queue";
import { PREVIOUS_JOB, previousJobs } from "@/features/companies/previous-job";
import { companyStatus, monthLabel, type CompanyStatus } from "@/features/companies/status";
import type { MailItem } from "@/features/mail/mail-item";
import type { ComingUpItem } from "./coming-up";
import { readApplications, type ApplicationRecord } from "@/features/applications/read";
import { loadMailContext } from "@/features/mail/context";
import { ApiError } from "@/features/agent-api/http";
import {
  listMail,
  mailFacts,
  mailListSchema,
  mailScope,
  notExcluded,
  readMailItem,
} from "@/features/mail/mail-list";
import { readMailTriage } from "@/features/mail/read";
import { mailTags, tagOf, type MailTag } from "@/features/mail/tags";
import { queueMailFrom } from "@/features/mail/triage";
import { timelineEntries, type TimelineDay } from "./entries";
import { companyRows, type RailRow } from "./index-rows";
import { mailHref } from "./query";

export type TimelineRole = {
  id: string;
  role: string;
  source: string;
  phase: Phase;
  state: RecordState;
};
export type TagCounts = Record<MailTag, number>;
export type CompanyTimelineData = {
  company: { key: string; name: string; slug: string | null; city: string };
  roles: TimelineRole[];
  days: TimelineDay[];
  nextCursor: string | null;
  tags: TagCounts;
};

/** An application as the handling bar sees it: its role, phase and recorded state. */
export function timelineRole(record: ApplicationRecord): TimelineRole {
  return {
    id: record.id,
    role: record.role,
    source: record.source,
    phase: record.phase,
    state: recordStateFrom(
      record,
      record.rounds,
      record.events.map((event) => event.eventType),
    ),
  };
}

async function tagCounts(scope: SQL[]): Promise<TagCounts> {
  const rows = await db
    .select({ classification: mailMessages.classification, count: count() })
    .from(mailMessages)
    .where(and(...scope))
    .groupBy(mailMessages.classification);
  const counts = Object.fromEntries(mailTags.map((tag) => [tag, 0])) as TagCounts;
  for (const row of rows) counts[tagOf(row.classification)] += row.count;
  return counts;
}

/** Emails saved as openings read as recorded, so they never offer Just info's Undo. */
export async function markSavedOpenings(days: TimelineDay[]) {
  const ids = days.flatMap((day) =>
    day.entries.flatMap((entry) =>
      entry.type === "mail" && !entry.recorded ? [entry.item.id] : [],
    ),
  );
  if (!ids.length) return days;
  const saved = new Set(
    (
      await db
        .selectDistinct({ id: mailEvents.mailMessageId })
        .from(mailEvents)
        .where(
          and(
            inArray(mailEvents.mailMessageId, ids),
            isNotNull(sql`${mailEvents.details}->>'savedOpeningId'`),
          ),
        )
    ).map((row) => row.id),
  );
  for (const day of days)
    for (const entry of day.entries)
      if (entry.type === "mail" && saved.has(entry.item.id)) entry.recorded = "Saved as an opening";
  return days;
}

/** One company's emails (50 a page) and application steps, for Mail and the company page. */
export async function readCompanyTimeline(
  key: string,
  filters: { tag?: MailTag; q?: string; application?: string; cursor?: string },
  now = new Date(),
): Promise<CompanyTimelineData> {
  const context = await loadMailContext();
  const [{ items, nextCursor }, { records }, tags] = await Promise.all([
    listMail({ company: key, attention: "all", ...filters }, context),
    readApplications(),
    tagCounts(
      mailScope(mailListSchema.parse({ company: key, application: filters.application }), context),
    ),
  ]);
  const own = records.filter((record) => record.companyKey === key);
  const shown = filters.application
    ? own.filter((record) => record.id === filters.application)
    : own;
  const listed = context.companies.find((company) => company.id === key);
  // An older page holds only what happened before its first email.
  const before = filters.cursor ? new Date(filters.cursor.split("|")[0]) : null;
  return {
    company: {
      key,
      name: listed?.name ?? own[0]?.companyName ?? items[0]?.company?.name ?? key,
      slug: listed?.slug ?? null,
      city: own[0]?.city ?? "",
    },
    roles: own.map(timelineRole),
    days: await markSavedOpenings(
      timelineEntries({
        mail: items,
        events: shown
          .flatMap((record) => record.events)
          .filter((event) => !before || event.occurredAt <= before),
        rounds: before ? [] : shown.flatMap((record) => record.rounds),
        complete: nextCursor === null,
        filtered: Boolean(filters.tag || filters.q),
        now,
      }),
    ),
    nextCursor,
    tags,
  };
}

const unplaced = [isNull(mailMessages.companyKey), isNull(mailMessages.linkedApplicationId)];

/** Needs a home: visible mail placed at no company and linked to no application. */
export async function readHomeMail(
  filters: { tag?: MailTag; q?: string; cursor?: string },
  now = new Date(),
): Promise<{ days: TimelineDay[]; nextCursor: string | null; tags: TagCounts }> {
  const [{ items, nextCursor }, tags] = await Promise.all([
    listMail({ attention: "all", ...filters }, undefined, unplaced),
    tagCounts([notExcluded, ...unplaced]),
  ]);
  return {
    days: await markSavedOpenings(
      timelineEntries({
        mail: items,
        events: [],
        rounds: [],
        complete: nextCursor === null,
        filtered: Boolean(filters.tag || filters.q),
        now,
      }),
    ),
    nextCursor,
    tags,
  };
}

/**
 * All job mail: every kept email, newest first, whichever company it belongs to, with each
 * company's roles so open mail gets the same suggestion as on the company's own timeline.
 */
export async function readAllMail(
  filters: { tag?: MailTag; q?: string; cursor?: string },
  now = new Date(),
): Promise<{
  days: TimelineDay[];
  nextCursor: string | null;
  tags: TagCounts;
  roles: Record<string, TimelineRole[]>;
}> {
  const [{ items, nextCursor }, tags, { records }] = await Promise.all([
    listMail({ attention: "all", ...filters }),
    tagCounts([notExcluded]),
    readApplications(),
  ]);
  const roles: Record<string, TimelineRole[]> = {};
  for (const record of records)
    if (record.source !== PREVIOUS_JOB)
      (roles[record.companyKey] ??= []).push(timelineRole(record));
  return {
    days: await markSavedOpenings(
      timelineEntries({
        mail: items,
        events: [],
        rounds: [],
        complete: nextCursor === null,
        filtered: Boolean(filters.tag || filters.q),
        now,
      }),
    ),
    nextCursor,
    tags,
    roles,
  };
}

export type CompanyIndex = {
  rows: RailRow[];
  home: { open: number; total: number; matches: number | null };
};

const comingUpDay = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});
/** "Overdue", "Today", "Tomorrow", then "Mon 2 Nov". */
function dueLabel(at: Date, now: Date) {
  const days = istDaysBetween(now, at);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  const parts = Object.fromEntries(
    comingUpDay.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}
/**
 * Coming up: booked rounds, OA deadlines and follow-ups due within the queue's horizon,
 * soonest first, then up to 10 open emails that have no date.
 */
export function comingUpFrom(input: {
  items: QueueItem[];
  records: { id: string; companyKey: string; companyName: string }[];
  openMail: MailItem[];
  now: Date;
}): ComingUpItem[] {
  const recordOf = new Map(input.records.map((record) => [record.id, record]));
  const dated = input.items
    .filter((item) => ["round", "deadline", "followup"].includes(item.reason) && item.recordId)
    .flatMap((item) => {
      const record = recordOf.get(item.recordId!);
      return record
        ? [
            {
              id: item.key,
              at: item.dueAt.toISOString(),
              label: dueLabel(item.dueAt, input.now),
              title: item.title,
              companyKey: record.companyKey,
              companyName: record.companyName,
              tag: null,
              mailId: null,
            },
          ]
        : [];
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  const undated = input.openMail.slice(0, 10).map((item) => ({
    id: `mail:${item.id}`,
    at: null,
    label: "No date",
    title: item.subject,
    companyKey: item.company?.key ?? "",
    companyName: item.company?.name ?? "Needs a home",
    tag: item.tag,
    mailId: item.id,
  }));
  return [...dated, ...undated];
}

/** The Mail rail: Applications' lanes (the same needs-you signal) joined with visible mail. */
export async function readCompanyIndex(
  filters: { tag?: MailTag; q?: string },
  now = new Date(),
): Promise<CompanyIndex & { statuses: Record<string, CompanyStatus>; comingUp: ComingUpItem[] }> {
  const [context, { records: all, snoozes }, previous] = await Promise.all([
    loadMailContext(),
    readApplications(),
    previousJobs(),
  ]);
  // Previous jobs are history: never lanes, queue items or Needs you.
  const records = all.filter((record) => record.source !== PREVIOUS_JOB);
  const triage = await readMailTriage(records);
  const items = buildQueue({ records, mail: queueMailFrom(triage.messages), snoozes, now });
  const lanes = buildLanes({ records, items, pending: pendingMailFrom(triage.messages), now });
  const keys = new Map(context.applications.map((app) => [app.id, app.company]));
  const { facts, matches } = await mailFacts(context, (id) => keys.get(id), filters);
  const joined = new Map<string, string>();
  for (const job of previous)
    if (!joined.has(job.companyKey))
      joined.set(job.companyKey, `Joined ${monthLabel(job.joinedOn)}`);
  const { rows, home } = companyRows({
    lanes,
    mail: facts,
    names: new Map(context.companies.map((company) => [company.id, company])),
    matches:
      matches && new Map([...matches].flatMap(([key, count]) => (key ? [[key, count]] : []))),
    previous: joined,
  });
  const totals = new Map(facts.map((row) => [row.key, row.total]));
  // Every rail company, plus former employers that have no lane or mail yet.
  const shown = new Set([...rows.map((row) => row.key), ...previous.map((job) => job.companyKey)]);
  const statuses = Object.fromEntries(
    [...shown].map((key) => [
      key,
      companyStatus({
        records: records.filter((record) => record.companyKey === key),
        mailCount: totals.get(key) ?? 0,
        previousJobs: previous.filter((job) => job.companyKey === key),
        now,
      }),
    ]),
  );
  const open = await listMail({ attention: "open" }, context);
  return {
    rows,
    home: { ...home, matches: matches ? (matches.get(null) ?? 0) : null },
    statuses,
    comingUp: comingUpFrom({ items, records, openMail: open.items, now }),
  };
}

/** Where an old `/mail/<id>` link now opens; null when the email is missing or excluded. */
export async function mailLocation(id: string): Promise<string | null> {
  try {
    const item = await readMailItem(id);
    return item.company
      ? mailHref({ company: item.company.key, mail: id })
      : mailHref({ home: true, mail: id });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
