import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, BriefcaseBusiness } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import type { TriageData, TriageMessage } from "@/features/mail/read";
import { suggestedOutcome } from "@/features/mail/triage";
import { dismissMail, linkMailOnly, undoDismiss } from "@/features/mail/triage-actions";
import { cn } from "@/lib/utils";
import { formatDay } from "../dates";
import { accountTone } from "./inboxes";
import { RecordPicker } from "./record-picker";

type Records = { id: string; label: string }[];

export function EmailsPanel({
  data,
  records,
  inboxes,
  notice,
  accountIndex,
}: {
  data: TriageData;
  records: Records;
  inboxes: ReactNode;
  notice?: string;
  accountIndex: Record<string, number>;
}) {
  const unmatched = data.messages.filter(
    (message) => message.bucket === "updates" && !message.record,
  );
  const roles = data.messages.filter((message) => message.bucket === "roles");
  const noise = data.messages.filter((message) => message.bucket === "noise");
  const card = (message: TriageMessage) => (
    <MailCard key={message.id} message={message} records={records} accountIndex={accountIndex} />
  );
  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
      <section aria-label="Inboxes">{inboxes}</section>
      <MailSection
        id="unmatched"
        title="Replies we couldn't match"
        note="Interview or assessment mail that matched none of your records. Pick the company."
        rows={unmatched.map(card)}
      />
      <MailSection
        id="roles"
        title="New roles"
        note="Recruiters pitching roles. Save the ones worth a look."
        rows={roles.map(card)}
      />
      <MailSection
        id="noise"
        title="Job alerts and auto-replies"
        note="Not counted in the Emails badge."
        rows={noise.map(card)}
        footer={
          noise.length > 1 && (
            <ActionForm feedback="inverse" action={dismissMail} pendingLabel="Dismissing">
              <input type="hidden" name="bucket" value="noise" />
              <Button variant="ghost" size="sm" className="h-8 px-3">
                <Archive size={14} aria-hidden />
                Clear all
              </Button>
            </ActionForm>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{data.handled} handled</span>
        {data.lastDismissedId && (
          <ActionForm
            feedback="inverse"
            action={undoDismiss}
            className="contents"
            pendingLabel="Restoring"
          >
            <input type="hidden" name="mailId" value={data.lastDismissedId} />
            <input type="hidden" name="dismissal" value={data.lastDismissalToken ?? ""} />
            <button className="border-0 bg-transparent p-0 text-link hover:underline">
              Undo last dismiss
            </button>
          </ActionForm>
        )}
        <Link href="/mail/import" className="text-link">
          Import messages
        </Link>
      </div>
    </div>
  );
}

function MailSection({
  id,
  title,
  note,
  rows,
  footer,
}: {
  id: string;
  title: string;
  note: string;
  rows: ReactNode[];
  footer?: ReactNode;
}) {
  return (
    <section aria-labelledby={`mail-${id}`} className="flex flex-col gap-2">
      <h3 id={`mail-${id}`} className="m-0 text-sm font-semibold">
        {title}{" "}
        <span className="font-normal text-muted-foreground tabular-nums">· {rows.length}</span>
      </h3>
      <p className="m-0 text-xs text-muted-foreground">{note}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows}
        {!rows.length && <li className="text-sm text-muted-foreground">Nothing here.</li>}
      </ul>
      {footer}
    </section>
  );
}

function MailCard({
  message,
  records,
  accountIndex,
}: {
  message: TriageMessage;
  records: Records;
  accountIndex: Record<string, number>;
}) {
  return (
    <li className="rounded-2xl bg-background/60 p-3 ring-1 ring-border">
      {message.accountEmail && (
        <p className="m-0 mb-1 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cn(
              "mt-1 size-2 shrink-0 rounded-full",
              accountTone(accountIndex[message.accountEmail] ?? 3),
            )}
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">{message.accountEmail}</span>
        </p>
      )}
      <p className="m-0 flex items-start justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {message.senderName || message.sender}
        </span>
        <span className="shrink-0 tabular-nums">{formatDay(message.receivedAt)}</span>
      </p>
      <Link
        href={`/mail/${message.id}`}
        className="mt-1.5 block text-sm font-medium text-foreground [overflow-wrap:anywhere]"
      >
        {message.subject}
      </Link>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {message.bucket === "updates" && (
          <RecordPicker
            mailId={message.id}
            outcome={suggestedOutcome[message.classification]}
            records={records}
          />
        )}
        {message.bucket === "roles" && (
          <Button size="sm" className="h-8 rounded-full px-3" asChild>
            <Link href={`/jobs/new?fromMail=${message.id}`}>
              <BriefcaseBusiness size={14} aria-hidden />
              Save as opening
            </Link>
          </Button>
        )}
        {message.classification === "APPLICATION_ACKNOWLEDGEMENT" && message.record && (
          <ActionForm
            feedback="inverse"
            action={linkMailOnly}
            className="contents"
            pendingLabel="Linking"
          >
            <input type="hidden" name="mailId" value={message.id} />
            <input type="hidden" name="recordId" value={message.record.id} />
            <Button size="sm" variant="outline" className="h-8 rounded-full px-3">
              Link
            </Button>
          </ActionForm>
        )}
        <ActionForm
          feedback="inverse"
          action={dismissMail}
          className="contents"
          pendingLabel="Dismissing"
        >
          <input type="hidden" name="mailId" value={message.id} />
          <Button size="sm" variant="ghost" className="h-8 rounded-full px-3">
            Dismiss
          </Button>
        </ActionForm>
      </div>
    </li>
  );
}
