import { CalendarCheck, CalendarClock, ExternalLink, Link2, type LucideIcon } from "lucide-react";
import { indiaDate, formatDay } from "@/features/applications/dates";
import { methodLabel } from "@/features/applications/phase";
import { FollowUp } from "@/features/applications/views/follow-up";
import { NotesFold } from "@/features/applications/views/notes/notes-fold";
import { resumeFileHref } from "@/features/resumes/links";
import { TOOL_META, TOOL_SOURCES } from "@/features/resumes/fit/tools";
import { cn } from "@/lib/utils";
import type { CompanyApplicationRow } from "../applications";
import { EditDetails, ResumePreview } from "./row-dialogs";

const withYear = (date: Date) => `${formatDay(date)} ${indiaDate(date).slice(0, 4)}`;

function Detail({
  icon: Icon,
  term,
  children,
}: {
  icon: LucideIcon;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon aria-hidden size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{term}</dt>
        <dd className="m-0 mt-0.5 grid min-w-0 justify-items-start gap-1 text-sm [&>*]:min-w-0">
          {children}
        </dd>
      </div>
    </div>
  );
}

/** The stored tool scores as compact tiles; nothing when none was checked. */
function ScoreTiles({ scores }: { scores: NonNullable<CompanyApplicationRow["scores"]> }) {
  if (TOOL_SOURCES.every((id) => "notChecked" in scores[id])) return null;
  return (
    <ul aria-label="Résumé scores" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
      {TOOL_SOURCES.map((id) => {
        const summary = scores[id];
        const value = "notChecked" in summary ? null : summary.score;
        return (
          <li
            key={id}
            className="grid min-w-0 justify-items-center rounded-xl bg-muted/60 px-1 py-2 text-center"
          >
            <b
              className={cn(
                "text-lg leading-none font-semibold tabular-nums",
                value === null && "text-muted-foreground",
              )}
            >
              {value === null ? "—" : Math.round(value)}
            </b>
            <span className="mt-1 max-w-full truncate text-[11px] text-muted-foreground">
              {TOOL_META[id].name}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The application's side column: its details, the résumé that was sent with its scores, and
 * the notes (which open in a dialog).
 */
export function DetailsAside({
  row,
  versions,
  editable,
}: {
  row: CompanyApplicationRow;
  versions: { id: string; label: string }[];
  editable: boolean;
}) {
  const { record } = row;
  return (
    <aside data-testid="row-aside" className="min-w-0 space-y-3">
      <section
        aria-label="Details"
        className="min-w-0 space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border"
      >
        <h3 className="m-0 text-sm font-semibold">Details</h3>
        <dl className="m-0 grid gap-3.5">
          <Detail icon={Link2} term="Opening">
            <a
              href={record.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={record.requisition ?? "No requisition"}
              className="inline-flex max-w-full min-w-0 items-center gap-1 text-link"
            >
              <span className="truncate">{record.requisition ?? "No requisition"}</span>
              <ExternalLink aria-hidden size={12} className="shrink-0" />
            </a>
          </Detail>
          <Detail icon={CalendarCheck} term="Applied">
            <span className="truncate">
              {record.sentAt ? withYear(record.sentAt) : "Not sent"}
              {" · "}
              {methodLabel[record.source] ?? "Applied directly"}
            </span>
          </Detail>
          {record.phase !== "Closed" && (
            <Detail icon={CalendarClock} term="Follow-up">
              <FollowUp
                key={`follow-up-${record.id}`}
                recordId={record.id}
                day={record.nextActionAt ? indiaDate(record.nextActionAt) : null}
                label={record.nextActionAt ? formatDay(record.nextActionAt) : null}
                note={record.nextActionNote}
              />
            </Detail>
          )}
          <Detail icon={ExternalLink} term="Application page">
            {record.applicationUrl ? (
              <a
                href={record.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={record.applicationUrl}
                className="min-w-0 max-w-full truncate text-link"
              >
                {record.applicationUrl}
              </a>
            ) : null}
            <EditDetails
              recordId={record.id}
              applicationUrl={record.applicationUrl}
              resumeVersionId={record.resumeVersionId}
              resumeLabel={record.resume?.filename ?? null}
              editable={editable}
              versions={versions}
              addLink={!record.applicationUrl}
            />
          </Detail>
        </dl>
        <div className="space-y-2.5">
          <h3 className="m-0 text-sm font-semibold">Résumé used</h3>
          {record.resume ? (
            <div className="grid min-w-0 gap-0.5 rounded-xl bg-muted/60 p-2.5 text-sm">
              <ResumePreview
                versionId={record.resume.id}
                label={record.resume.label}
                filename={record.resume.filename}
              />
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">None recorded</p>
          )}
          {row.scores && <ScoreTiles scores={row.scores} />}
        </div>
      </section>
      <NotesFold
        variant="dialog"
        recordId={record.id}
        notes={record.notes}
        scores={row.scores}
        resumesHref={record.resume ? resumeFileHref(record.resume.id) : undefined}
      />
    </aside>
  );
}
