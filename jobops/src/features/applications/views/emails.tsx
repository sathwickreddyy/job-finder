import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, BriefcaseBusiness, Link2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import type { TriageData, TriageMessage } from "@/features/mail/read";
import { linkHref, suggestedOutcome, type Bucket } from "@/features/mail/triage";
import { dismissMail, linkMailOnly, undoDismiss } from "@/features/mail/triage-actions";
import { formatDay } from "../dates";
import { RecordPicker } from "./record-picker";
import { accountTone } from "./inboxes";
import { cn } from "@/lib/utils";

const buckets: { id: Bucket; title: string; note: string }[] = [
  {
    id: "updates",
    title: "Updates on your records",
    note: "Link them so the queue and rounds stay current.",
  },
  {
    id: "roles",
    title: "New roles for you",
    note: "Recruiters reaching out. Save the ones worth a look.",
  },
  { id: "noise", title: "Probably noise", note: "Job alerts and automatic replies." },
];

export function EmailsView({
  data,
  records,
  refresh,
  notice,
  accountIndex,
}: {
  data: TriageData;
  records: { id: string; label: string }[];
  refresh: ReactNode;
  notice?: string;
  accountIndex: Record<string, number>;
}) {
  return (
    <div className="space-y-5">
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
      {refresh}
      <div className="grid gap-4 lg:grid-cols-3">
        {buckets.map((bucket) => {
          const rows = data.messages.filter((message) => message.bucket === bucket.id);
          return (
            <section
              key={bucket.id}
              aria-labelledby={`bucket-${bucket.id}`}
              className="flex min-w-0 flex-col rounded-3xl bg-card p-4 ring-1 ring-border"
            >
              <h2 id={`bucket-${bucket.id}`} className="m-0 text-base font-semibold">
                {bucket.title}{" "}
                <span className="font-normal text-muted-foreground tabular-nums">
                  {rows.length}
                </span>
              </h2>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">{bucket.note}</p>
              <ul className="m-0 mt-3 flex-1 list-none space-y-2 p-0">
                {rows.map((message) => (
                  <MailCard
                    key={message.id}
                    message={message}
                    records={records}
                    accountIndex={accountIndex}
                  />
                ))}
                {!rows.length && (
                  <li className="rounded-2xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                    All clear
                  </li>
                )}
              </ul>
              {bucket.id === "noise" && rows.length > 1 && (
                <ActionForm
                  feedback="inverse"
                  action={dismissMail}
                  className="mt-3"
                  pendingLabel="Dismissing"
                >
                  <input type="hidden" name="bucket" value="noise" />
                  <Button variant="ghost" size="sm" className="h-8 px-3">
                    <Archive size={14} aria-hidden />
                    Dismiss all {rows.length}
                  </Button>
                </ActionForm>
              )}
            </section>
          );
        })}
      </div>
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

function MailCard({
  message,
  records,
  accountIndex,
}: {
  accountIndex: Record<string, number>;
  message: TriageMessage;
  records: { id: string; label: string }[];
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
      {message.record && (
        <p className="m-0 mt-1 flex items-center gap-1 text-xs text-link">
          <Link2 size={11} aria-hidden />
          Matches {message.record.company} · {message.record.role}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {message.bucket === "updates" &&
          (message.record ? (
            <Button size="sm" className="h-8 rounded-full px-3" asChild>
              <Link href={linkHref(message, message.record.id)}>Link and update</Link>
            </Button>
          ) : (
            <RecordPicker
              mailId={message.id}
              outcome={suggestedOutcome[message.classification]}
              records={records}
            />
          ))}
        {message.bucket === "roles" && (
          <Button size="sm" className="h-8 rounded-full px-3" asChild>
            <Link href={`/jobs/new?fromMail=${message.id}`}>
              <BriefcaseBusiness size={14} aria-hidden />
              Save as opening
            </Link>
          </Button>
        )}
        {message.bucket === "noise" &&
          message.classification === "APPLICATION_ACKNOWLEDGEMENT" &&
          message.record && (
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
          <Button
            size="sm"
            variant={message.bucket === "noise" ? "outline" : "ghost"}
            className="h-8 rounded-full px-3"
          >
            Dismiss
          </Button>
        </ActionForm>
      </div>
    </li>
  );
}
