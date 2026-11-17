import Link from "next/link";
import { currentNamedStep } from "@/features/applications/named-steps";
import { initialOutcome } from "@/features/applications/phase";
import { RulePanel } from "@/features/mail/search/rule-panel";
import { CompanyTimeline } from "@/features/timeline/timeline";
import type { CompanyApplicationRow, CompanyApplications } from "../applications";
import { ApplicationRow } from "./application-row";
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
  const first =
    target ?? mailRow ?? data.rows.find((row) => row.record.phase !== "Closed")?.record.id;
  return (
    <div className="min-w-0 space-y-8">
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
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
      {(data.newMail.days.length > 0 || data.unplaced.length > 0) && (
        <section id="unplaced" aria-labelledby="unplaced-title" className="scroll-mt-24 space-y-3">
          <div>
            <h2 id="unplaced-title" className="m-0 text-base font-semibold">
              {companyName}, not on an application
            </h2>
            <p className="m-0 mt-0.5 text-sm text-muted-foreground">
              Company mail that is not linked to any application.
            </p>
          </div>
          {data.newMail.days.length > 0 && (
            <CompanyTimeline
              days={data.newMail.days}
              handling={data.newMail.handling}
              roles={[]}
              allRolesHref=""
              role={null}
              openMail={unplacedOpen}
              olderHref={null}
              inboxes={inboxes}
            />
          )}
          {(data.unplaced.length > 0 || data.unplacedOlderHref) && (
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
          )}
        </section>
      )}
      {data.search && (
        <RulePanel data={data.search} companyKey={companyKey} companyName={companyName} />
      )}
    </div>
  );
}
