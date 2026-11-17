import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { currentNamedStep } from "@/features/applications/named-steps";
import { initialOutcome } from "@/features/applications/phase";
import { companyPageHref } from "@/features/applications/navigation";
import { RulePanel } from "@/features/mail/search/rule-panel";
import { CompanyTimeline } from "@/features/timeline/timeline";
import type { TimelineDay } from "@/features/timeline/entries";
import type { CompanyApplicationRow, CompanyApplications } from "../applications";
import { ApplicationRow } from "./application-row";
import { NewMailTray } from "./new-mail-tray";
import { RowBody, addableOf, withYear } from "./row-body";

/** Mail on this application still waiting for attention. */
const newMailOf = (row: CompanyApplicationRow) =>
  row.days.reduce(
    (total, day) =>
      total +
      day.entries.filter((entry) => entry.type === "mail" && entry.item.attention === "open")
        .length,
    0,
  );
/** Whether a requested outcome opens + Add step (so the email popup stays shut) for this row. */
const panelOpensFor = (
  row: CompanyApplicationRow,
  requested: string | undefined,
  source: CompanyApplications["source"] | undefined,
) =>
  requested !== undefined &&
  (initialOutcome(addableOf(row), requested) !== null || !!source?.error);

/**
 * The company page's first tab: one accordion row per application, newest applied first, each
 * with its facts, notes, tracker and timeline, then company mail that belongs to no application.
 * The newest active application opens by default; a deep link or an email opens its own.
 */
export function ApplicationsTab({
  data,
  companyKey,
  companyName,
  openId,
  requested,
  mailIntent,
  notice,
  now,
}: {
  data: CompanyApplications;
  companyKey: string;
  companyName: string;
  openId?: string | null;
  requested?: string;
  mailIntent?: string;
  /** The result of an action that navigated here, such as unlinking an email. */
  notice?: string;
  now: Date;
}) {
  const inboxes = data.search?.inboxes.map((row) => row.account);
  const target = data.rows.find((row) => row.record.id === openId)?.record.id ?? null;
  const holdsMail = (row: CompanyApplicationRow) =>
    !!mailIntent &&
    row.days.some((day) =>
      day.entries.some((entry) => entry.type === "mail" && entry.item.id === mailIntent),
    );
  const mailRow = data.rows.find(holdsMail)?.record.id ?? null;
  // The unplaced popup stays shut only while the targeted row's own panel takes the request.
  const targetRow = data.rows.find((row) => row.record.id === target);
  const unplacedOpen =
    targetRow && panelOpensFor(targetRow, requested, data.source ?? undefined)
      ? null
      : (mailIntent ?? null);
  const mailEntries = (days: TimelineDay[]) =>
    days.flatMap((day) => day.entries.filter((entry) => entry.type === "mail"));
  const handled = mailEntries(data.unplaced).length;
  const holdsUnplaced =
    !!mailIntent && mailEntries(data.unplaced).some((entry) => entry.item.id === mailIntent);
  const pageHref = companyPageHref({
    companyKey,
    companyHref: data.rows[0]?.record.companyHref,
  });
  const placeOptions = {
    companies: [{ key: companyKey, name: companyName }],
    applications: data.rows.map(({ record }) => ({ id: record.id, label: record.role })),
  };
  const first =
    target ?? mailRow ?? data.rows.find((row) => row.record.phase !== "Closed")?.record.id;
  return (
    <div className="flex min-w-0 flex-col gap-8">
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
      <NewMailTray
        companyKey={companyKey}
        newMail={data.newMail}
        openMail={unplacedOpen}
        inboxes={inboxes}
        placeOptions={placeOptions}
        pageHref={pageHref}
      />
      {data.rows.length ? (
        <ol aria-label="Applications" className="m-0 flex list-none flex-col gap-3 p-0">
          {data.rows.map((row) => {
            const { record } = row;
            const step = currentNamedStep(row.steps);
            return (
              <ApplicationRow
                key={record.id}
                id={record.id}
                role={record.role}
                meta={[
                  record.sentAt ? `Applied ${withYear(record.sentAt)}` : "Not sent",
                  record.requisition ?? "No requisition",
                  record.city,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                steps={row.steps}
                pill={step.label}
                detail={step.detail}
                due={step.due}
                tone={step.tone}
                newCount={newMailOf(row)}
                defaultOpen={record.id === first || record.id === mailRow}
              >
                <RowBody
                  row={row}
                  data={data}
                  requested={record.id === target ? requested : undefined}
                  mailIntent={record.id === target || holdsMail(row) ? mailIntent : undefined}
                  inboxes={inboxes}
                  now={now}
                />
              </ApplicationRow>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          No applications recorded for {companyName} yet.{" "}
          <Link href="/applications/new" className="text-link">
            Record an application
          </Link>
        </p>
      )}
      {(data.unplaced.length > 0 || data.unplacedOlderHref) && (
        <details
          id="unplaced"
          open={holdsUnplaced || undefined}
          className="group scroll-mt-24 rounded-3xl bg-card ring-1 ring-border"
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              size={16}
              className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            />
            Other company mail · {handled}
            {data.unplacedOlderHref ? "+" : ""}
          </summary>
          <div className="px-3 pb-3 sm:px-4 sm:pb-4">
            <CompanyTimeline
              days={data.unplaced}
              handling={data.unplacedHandling}
              roles={[]}
              allRolesHref=""
              role={null}
              openMail={unplacedOpen}
              olderHref={data.unplacedOlderHref}
              inboxes={inboxes}
            />
          </div>
        </details>
      )}
      {data.search && (
        <RulePanel data={data.search} companyKey={companyKey} companyName={companyName} />
      )}
    </div>
  );
}
