import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mailMessages, resumes, resumeVersions } from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { indiaDate } from "@/features/applications/dates";
import { namedStepsOf, type NamedStep } from "@/features/applications/named-steps";
import { availableOutcomes, recordStateFrom, type OutcomeId } from "@/features/applications/phase";
import { readApplications, type ApplicationRecord } from "@/features/applications/read";
import { listRoundQuestions } from "@/features/interviews/questions";
import { lastActivityOf, type LastActivity } from "@/features/companies/last-activity";
import { PREVIOUS_JOB } from "@/features/companies/previous-job";
import type { CompanyStatus } from "@/features/companies/status";
import { readCompanySearch } from "@/features/mail/company-search";
import type { TimelineDay } from "@/features/timeline/entries";
import type { RailDue } from "@/features/timeline/index-rows";
import { mailCursor } from "@/features/timeline/query";
import { readOpenMail } from "@/features/mail/read";
import { loadMailContext } from "@/features/mail/context";
import { listMail } from "@/features/mail/mail-list";
import { timelineEntries } from "@/features/timeline/entries";
import {
  markSavedOpenings,
  readCompanyIndex,
  readCompanyTimeline,
  timelineRole,
} from "@/features/timeline/read";
import type { RoundCardData } from "@/features/timeline/round-card";
import { suggestHandling, type Handling } from "@/features/timeline/suggest";
import { summarizeTool, type ToolSummary } from "@/features/resumes/fit/derive";
import { getFit } from "@/features/resumes/fit/service";
import { TOOL_SOURCES, type ToolSource } from "@/features/resumes/fit/tools";

export type CompanyApplicationRow = {
  record: ApplicationRecord;
  steps: NamedStep[];
  days: TimelineDay[];
  handling: Record<string, Handling>;
  olderHref: string | null;
  roundCards: Record<string, RoundCardData>;
  scores: Record<ToolSource, ToolSummary> | null;
  outcomes: OutcomeId[];
};
export type CompanyApplications = {
  rows: CompanyApplicationRow[];
  /** Open mail on no application, newest first; `more` when the Mail page holds further pages. */
  newMail: { days: TimelineDay[]; handling: Record<string, Handling>; more: boolean };
  /** Handled mail on no application. */
  unplaced: TimelineDay[];
  unplacedHandling: Record<string, Handling>;
  /** Shows the next page of mail that is on no application. */
  unplacedOlderHref: string | null;
  next: { text: string; due: RailDue | null } | null;
  status: CompanyStatus | null;
  search: Awaited<ReturnType<typeof readCompanySearch>> | null;
  /** The newest thing that has already happened for this company. */
  lastActivity: LastActivity;
  /** The résumé files an unsent application can still be pointed at. */
  versions: { id: string; label: string }[];
  /** The email an outcome link names for the open row: its summary, or why it cannot be used. */
  source?: { recordId: string; id?: string; subject?: string; error?: string } | null;
};

async function sourceOf(
  open: string | null,
  query: { mail?: string; outcome?: string },
): Promise<CompanyApplications["source"]> {
  if (!open || !query.outcome || query.mail === undefined) return null;
  if (!z.uuid().safeParse(query.mail).success)
    return {
      recordId: open,
      error: "The source message link is invalid. Open Mail to choose a message.",
    };
  try {
    const message = await readOpenMail(query.mail, open);
    return { recordId: open, id: message.id, subject: message.subject };
  } catch (error) {
    return {
      recordId: open,
      error: error instanceof Error ? error.message : "The source message could not be loaded.",
    };
  }
}

const handlingOf = (days: TimelineDay[], roles: Parameters<typeof suggestHandling>[1]) =>
  Object.fromEntries(
    days.flatMap((day) =>
      day.entries.flatMap((entry) =>
        entry.type === "mail" && entry.item.attention === "open"
          ? [[entry.item.id, suggestHandling(entry.item, roles)]]
          : [],
      ),
    ),
  );

/** The stored scores for the submitted version against this application's saved job. */
async function scoresOf(record: ApplicationRecord) {
  if (!record.resumeVersionId) return null;
  const fit = await getFit(record.resumeVersionId);
  const group = fit?.groups.find((item) => item.target.jobId === record.jobId);
  if (!group) return null;
  return Object.fromEntries(
    TOOL_SOURCES.map((source) => [
      source,
      summarizeTool(source, group.mine[source], group.base[source]),
    ]),
  ) as Record<ToolSource, ToolSummary>;
}

async function questionsOf(id: string) {
  try {
    return await listRoundQuestions(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

function roundCardsOf(
  record: ApplicationRecord,
  questions: Awaited<ReturnType<typeof listRoundQuestions>>,
  now: Date,
) {
  return Object.fromEntries(
    [...record.rounds]
      .sort((a, b) => a.position - b.position)
      .filter((round) => round.outcome !== "CANCELLED")
      .map((round): [string, RoundCardData] => [
        round.id,
        {
          recordId: record.id,
          questions: questions.find((item) => item.id === round.id)?.questions ?? [],
          today: indiaDate(now),
        },
      ]),
  );
}

async function versionChoices() {
  const rows = await db
    .select({ version: resumeVersions, family: resumes })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(eq(resumeVersions.isMaster, false));
  return rows.map(({ version, family }) => ({
    id: version.id,
    label: `${family.name} / ${version.versionLabel} / ${version.originalFilename}`,
  }));
}

/**
 * One company's applications, newest applied first, each with its own mail, steps and rounds,
 * plus the company mail that belongs to no application. The cursor pages only the open row.
 */
export async function readCompanyApplications(
  companyKey: string,
  query: {
    open?: string;
    cursor?: string;
    unplacedCursor?: string;
    mail?: string;
    outcome?: string;
  },
  now = new Date(),
): Promise<CompanyApplications> {
  const open = z.uuid().safeParse(query.open).success ? query.open! : null;
  const cursor = mailCursor.safeParse(query.cursor).success ? query.cursor! : null;
  const unplacedCursor = mailCursor.safeParse(query.unplacedCursor).success
    ? query.unplacedCursor!
    : null;
  const { records } = await readApplications();
  const own = records
    .filter((record) => record.companyKey === companyKey && record.source !== PREVIOUS_JOB)
    // Unsent records have no date yet and come first, as the newest thing to act on.
    .sort(
      (a, b) =>
        (b.sentAt?.getTime() ?? Infinity) - (a.sentAt?.getTime() ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
  const noApplication = [isNull(mailMessages.linkedApplicationId)];
  // One mail context serves the tray, the handled page and the first-page re-read below.
  const mailContext = await loadMailContext();
  const [rows, fresh, loose, index, search, versions] = await Promise.all([
    Promise.all(
      own.map(async (record): Promise<CompanyApplicationRow> => {
        const [timeline, questions, scores] = await Promise.all([
          readCompanyTimeline(
            companyKey,
            { application: record.id, ...(record.id === open && cursor ? { cursor } : {}) },
            now,
          ),
          questionsOf(record.id),
          scoresOf(record),
        ]);
        const outcomes = availableOutcomes(
          recordStateFrom(
            record,
            record.rounds,
            record.events.map((event) => event.eventType),
          ),
        );
        return {
          record,
          steps: namedStepsOf(record, now),
          days: timeline.days,
          handling: handlingOf(timeline.days, timeline.roles),
          olderHref: timeline.nextCursor
            ? `?${new URLSearchParams({ open: record.id, cursor: timeline.nextCursor })}#application-${record.id}`
            : null,
          roundCards: roundCardsOf(record, questions, now),
          scores,
          outcomes,
        };
      }),
    ),
    // Open mail on no application is the new-mail tray: its first page only.
    listMail({ company: companyKey, attention: "open" }, mailContext, noApplication),
    // Handled mail on no application is paged on its own, so older mail is never cut off.
    listMail(
      {
        company: companyKey,
        attention: "handled",
        ...(unplacedCursor ? { cursor: unplacedCursor } : {}),
      },
      mailContext,
      noApplication,
    ),
    readCompanyIndex({}, now),
    readCompanySearch(companyKey).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    versionChoices(),
  ]);
  const placeLoose = (page: typeof loose) =>
    markSavedOpenings(
      timelineEntries({
        mail: page.items,
        events: [],
        rounds: [],
        complete: page.nextCursor === null,
        filtered: false,
        now,
      }),
    );
  const [newDays, unplaced] = await Promise.all([placeLoose(fresh), placeLoose(loose)]);
  const roles = own.map(timelineRole);
  // Last activity never depends on the page being read: a cursor swaps in the first page.
  const [firstRow, firstUnplaced] = await Promise.all([
    cursor && open && own.some((record) => record.id === open)
      ? readCompanyTimeline(companyKey, { application: open }, now).then((item) => item.days)
      : null,
    unplacedCursor
      ? listMail({ company: companyKey, attention: "handled" }, mailContext, noApplication).then(
          placeLoose,
        )
      : null,
  ]);
  const activityDays = [
    ...rows.map((item) => (firstRow && item.record.id === open ? firstRow : item.days)),
    newDays,
    firstUnplaced ?? unplaced,
  ];
  const row = index.rows.find((item) => item.key === companyKey);
  return {
    rows,
    newMail: {
      days: newDays,
      handling: handlingOf(newDays, roles),
      more: fresh.nextCursor !== null,
    },
    unplaced,
    unplacedHandling: handlingOf(unplaced, roles),
    unplacedOlderHref: loose.nextCursor
      ? `?${new URLSearchParams({ unplacedCursor: loose.nextCursor })}#unplaced`
      : null,
    lastActivity: lastActivityOf(activityDays, now),
    next: row?.next ? { text: row.next, due: row.due } : null,
    status: index.statuses[companyKey] ?? null,
    search,
    versions,
    source: await sourceOf(open, query),
  };
}
