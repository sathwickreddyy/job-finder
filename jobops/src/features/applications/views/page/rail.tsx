import type { ReactNode } from "react";
import Link from "next/link";
import { Download, FileText, Link2, Mail } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { MailDialogButton } from "@/features/mail/mail-dialog";
import { unlinkMail } from "@/features/mail/triage-actions";
import { addApplicationNote } from "../../actions";
import { formatDay } from "../../dates";
import type { DotTone } from "../../lanes";
import { methodLabel } from "../../phase";
import type { ApplicationRecord } from "../../read";
import { updateApplicationDetails } from "../../record-actions";
import { Timeline } from "../timeline";

type Choice = { id: string; label: string };
export type HistoryEntry = {
  key: string;
  at: Date;
  tone: DotTone;
  label: string;
  detail: string;
  tags: string[];
  href?: string;
};

function Card({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-3xl bg-card p-4 ring-1 ring-border">
      <h2 className="m-0 mb-3 flex min-w-0 items-center gap-2 text-sm font-semibold">
        {icon}
        <span className="truncate">{title}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * The right rail: the résumé that was sent, this application's mail (each opens the reading
 * popup), history, linked records and the folded Edit details form.
 */
export function ApplicationRail({
  record,
  linked,
  versions,
  history,
  editable,
  now,
}: {
  record: ApplicationRecord;
  linked: ApplicationRecord[];
  versions: Choice[];
  history: HistoryEntry[];
  editable: boolean;
  now: Date;
}) {
  const mail = [...record.linkedMail].sort(
    (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
  );
  return (
    <>
      <Card title="Résumé sent" icon={<FileText aria-hidden size={14} className="text-link" />}>
        {record.resume ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href={`/resumes?file=${record.resume.id}`}
              className="flex min-w-0 flex-col gap-0.5 rounded-2xl px-3 py-2 ring-1 ring-border hover:bg-muted hover:no-underline"
            >
              <span
                className="line-clamp-2 text-sm font-medium text-foreground"
                title={record.resume.label}
              >
                {record.resume.label}
              </span>
              <MiddleTruncate
                text={record.resume.filename}
                tail={22}
                className="text-xs text-muted-foreground"
              />
            </Link>
            <a
              href={`/api/resumes/${record.resume.id}/file?download=1`}
              className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-link"
            >
              <Download aria-hidden size={13} /> Download the PDF that was sent
            </a>
          </div>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">
            No résumé recorded for this application.
          </p>
        )}
      </Card>

      <Card
        title={`Mail · ${mail.length}`}
        icon={<Mail aria-hidden size={14} className="text-muted-foreground" />}
      >
        {mail.length ? (
          <>
            <ul className="m-0 -mx-1 flex list-none flex-col p-0">
              {mail.map((message) => (
                <li key={message.id} className="min-w-0">
                  <MailDialogButton
                    mailId={message.id}
                    className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted"
                    footer={
                      <ActionForm action={unlinkMail} feedback="inverse" pendingLabel="Unlinking">
                        <input type="hidden" name="mailId" value={message.id} />
                        <input type="hidden" name="recordId" value={record.id} />
                        <div className="flex flex-wrap items-center gap-3">
                          <Button variant="ghost" size="sm">
                            Unlink from this application
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Returns it to Mail. Recorded outcomes stay.
                          </span>
                        </div>
                      </ActionForm>
                    }
                  >
                    <span className="min-w-0 flex-1 truncate" title={message.subject}>
                      {message.subject || "(no subject)"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatDay(message.receivedAt)}
                    </span>
                  </MailDialogButton>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">No mail linked yet.</p>
        )}
      </Card>

      <Card title="History">
        <Timeline entries={history} now={now} />
        <ActionForm action={addApplicationNote} feedback="inverse" className="mt-4 space-y-2">
          <input type="hidden" name="id" value={record.id} />
          <label className="block text-sm">
            Add to history
            <textarea
              name="summary"
              rows={2}
              required
              maxLength={20000}
              className="mt-1 !min-h-16"
            />
          </label>
          <Button variant="outline" size="sm" className="h-9 px-4">
            Add note
          </Button>
        </ActionForm>
      </Card>

      {linked.length > 0 && (
        <Card title="Linked records" icon={<Link2 aria-hidden size={14} />}>
          <div className="flex flex-col gap-2">
            {linked.map((other) => (
              <Link
                key={other.id}
                href={`/applications/${other.id}`}
                className="block rounded-2xl bg-selected/50 px-3 py-2 text-sm text-selected-foreground hover:no-underline"
              >
                <span className="block font-medium [overflow-wrap:anywhere]">
                  {methodLabel[other.source] ?? "Record"}
                  {other.contact ? ` · ${other.contact}` : ""}
                </span>
                <span className="block text-xs [overflow-wrap:anywhere]">
                  {other.latest?.summary ?? "Nothing recorded yet"}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <details className="group min-w-0 rounded-3xl bg-card p-4 ring-1 ring-border">
        <summary className="cursor-pointer text-sm font-semibold">Edit details</summary>
        <ActionForm action={updateApplicationDetails} feedback="inverse" className="mt-3 space-y-4">
          <input type="hidden" name="id" value={record.id} />
          {editable ? (
            <Field label="Resume file used" name="resumeVersionId">
              <select
                id="resumeVersionId"
                name="resumeVersionId"
                defaultValue={record.resumeVersionId ?? ""}
              >
                <option value="">No file used / not selected</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <input type="hidden" name="resumeVersionId" value={record.resumeVersionId ?? ""} />
              <p className="m-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                The résumé sent stays fixed: {record.resume?.filename ?? "none recorded"}
              </p>
            </>
          )}
          <Field
            label="Application URL"
            name="applicationUrl"
            type="url"
            defaultValue={record.applicationUrl ?? ""}
          />
          <Button variant="outline">Save details</Button>
        </ActionForm>
      </details>
    </>
  );
}
