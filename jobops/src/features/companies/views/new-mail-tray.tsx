"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { formatDayTime } from "@/features/applications/dates";
import { MailDialog } from "@/features/mail/mail-dialog";
import type { MailItem } from "@/features/mail/mail-item";
import { inboxLabels, previewLine } from "@/features/mail/row-text";
import { TagPill } from "@/features/mail/tag-pill";
import { markAllJustInfoAction } from "@/features/mail/workspace-actions";
import type { TimelineMail } from "@/features/timeline/entries";
import { PlaceAt, type PlaceOptions } from "@/features/timeline/handling";
import { HandlingBar } from "@/features/timeline/handling-bar";
import { matchingRoles } from "@/features/timeline/role-match";
import type { Handling } from "@/features/timeline/suggest";
import { cn } from "@/lib/utils";
import type { CompanyApplications } from "../applications";

/** What the person picked for one email. Nothing is recorded until the bar's button is used. */
type Pick = { kind: "role"; id: string } | { kind: "info" } | { kind: "place" } | null;

const menuItem =
  "flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-muted hover:no-underline";

/** "Choose role" (then "Change"): a menu of this company's open applications, matches first. */
function RoleMenu({
  handling,
  matches,
  pick,
  canPlace,
  onPick,
  label,
}: {
  handling: Handling;
  matches: Set<string>;
  pick: Pick;
  canPlace: boolean;
  onPick: (pick: Exclude<Pick, null>) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const choose = (next: Exclude<Pick, null>) => {
    setOpen(false);
    onPick(next);
    trigger.current?.focus();
  };
  const ordered = [
    ...handling.applications.filter((app) => matches.has(app.id)),
    ...handling.applications.filter((app) => !matches.has(app.id)),
  ];
  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium",
          pick
            ? "border border-border text-foreground hover:bg-muted"
            : "bg-primary text-primary-foreground hover:bg-primary-hover",
        )}
      >
        {pick ? "Change" : "Choose role"}
        <ChevronDown
          aria-hidden
          size={15}
          className={cn("transition-transform", open && "rotate-180")}
        />
        <span className="sr-only">{`for ${label}`}</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-surface"
        >
          {ordered.length > 0 && (
            <p className="m-0 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Open applications
            </p>
          )}
          {ordered.map((app) => (
            <button
              key={app.id}
              type="button"
              aria-pressed={pick?.kind === "role" && pick.id === app.id}
              onClick={() => choose({ kind: "role", id: app.id })}
              className={menuItem}
            >
              {matches.has(app.id) && (
                <span className="rounded-full bg-selected px-2 py-0.5 text-[11px] font-medium text-selected-foreground">
                  match
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{app.role}</span>
            </button>
          ))}
          {ordered.length > 0 && <hr className="mx-2 my-1 border-0 border-t border-border" />}
          <button type="button" onClick={() => choose({ kind: "info" })} className={menuItem}>
            Just info, no application
          </button>
          {canPlace && (
            <button type="button" onClick={() => choose({ kind: "place" })} className={menuItem}>
              Place at a date…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** One new email: its line, a Choose role menu, and (once picked) the handling bar to confirm. */
function TrayEmail({
  entry,
  handling,
  inbox,
  placeOptions,
  returnTo,
  onOpen,
}: {
  entry: TimelineMail;
  handling: Handling;
  inbox: string;
  placeOptions?: PlaceOptions;
  returnTo: string;
  onOpen: () => void;
}) {
  const { item } = entry;
  const [pick, setPick] = useState<Pick>(
    handling.chosen ? { kind: "role", id: handling.chosen } : null,
  );
  const matches = matchingRoles(item, handling.applications);
  const hinted = handling.applications.filter((app) => matches.has(app.id));
  const preview = previewLine(item.text);
  const chosen =
    pick?.kind === "role" ? handling.applications.find((app) => app.id === pick.id) : undefined;
  const sender = item.sender;
  return (
    <li id={`mail-${item.id}`} className="scroll-mt-24 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
          <span
            role="img"
            aria-label="New"
            className="mt-2 size-2 shrink-0 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
          />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                aria-haspopup="dialog"
                data-mail-row={item.id}
                onClick={onOpen}
                className="min-w-0 truncate text-left text-sm font-semibold hover:underline"
              >
                {item.subject || "(no subject)"}
              </button>
              <TagPill tag={item.tag} />
            </div>
            <p className="m-0 truncate text-xs text-muted-foreground">
              {hinted.length > 0 ? (
                <>
                  Role in the email:{" "}
                  <b className="font-semibold text-foreground">
                    {hinted.map((app) => app.role).join(" / ")}
                  </b>
                  {sender && ` · ${sender}`}
                </>
              ) : (
                <>
                  {sender}
                  {preview && ` · ${preview}`}
                </>
              )}
            </p>
          </div>
        </div>
        <RoleMenu
          handling={handling}
          matches={matches}
          pick={pick}
          canPlace={!!placeOptions}
          onPick={setPick}
          label={item.subject || "this email"}
        />
      </div>
      {pick && (
        <div className="reveal mt-3 pl-5">
          {chosen && (
            <p className="m-0 mb-2 text-sm text-muted-foreground">
              Role: <b className="font-semibold text-foreground">{chosen.role}</b>
            </p>
          )}
          {pick.kind === "info" && (
            <p className="m-0 mb-2 text-sm text-muted-foreground">Just info, no application.</p>
          )}
          {pick.kind === "place" && placeOptions ? (
            <PlaceAt item={item} options={placeOptions} defaultOpen />
          ) : (
            <HandlingBar
              key={pick.kind === "role" ? pick.id : pick.kind}
              item={item}
              handling={
                pick.kind === "role"
                  ? { ...handling, chosen: pick.id }
                  : {
                      applications: [],
                      chosen: null,
                      suggested: "info",
                      reason: "Nothing to record from this email.",
                    }
              }
              returnTo={returnTo}
              ask={false}
            />
          )}
        </div>
      )}
      <span className="sr-only">{`Received in ${inbox}`}</span>
    </li>
  );
}

/**
 * Gallery new mail A: the company's open mail that is on no application, one line each with a
 * Choose role menu. Picking only selects; the handling bar then confirms what is recorded.
 */
export function NewMailTray({
  companyKey,
  newMail,
  openMail,
  inboxes = [],
  placeOptions,
  pageHref,
}: {
  companyKey: string;
  newMail: CompanyApplications["newMail"];
  openMail: string | null;
  inboxes?: string[];
  placeOptions?: PlaceOptions;
  /** The company page path an action returns to; defaults to the page for `companyKey`. */
  pageHref?: string;
}) {
  const entries = newMail.days.flatMap((day) =>
    day.entries.filter((entry): entry is TimelineMail => entry.type === "mail"),
  );
  const [openId, setOpenId] = useState<string | null>(openMail);
  const [linked, setLinked] = useState(openMail);
  if (linked !== openMail) {
    setLinked(openMail);
    setOpenId(openMail);
  }
  if (!entries.length) return null;
  const returnTo = pageHref ?? `/companies/${encodeURIComponent(companyKey)}`;
  const labels = inboxLabels([...inboxes, ...entries.map((entry) => entry.item.account)]);
  const inboxOf = (item: MailItem) =>
    labels[item.account] ?? (item.provider === "OUTLOOK" ? "Outlook" : "Gmail");
  const roles = Math.max(
    ...entries.map((entry) => newMail.handling[entry.item.id]?.applications.length ?? 0),
  );
  const newest = Math.max(...entries.map((entry) => Date.parse(entry.item.receivedAt)));
  const count = entries.length;
  const heading = `${count} new ${count === 1 ? "email" : "emails"} ${
    roles >= 2
      ? count === 1
        ? "needs a role"
        : "need a role"
      : count === 1
        ? "needs a look"
        : "need a look"
  }`;
  const openIndex = openId ? entries.findIndex((entry) => entry.item.id === openId) : -1;
  const opened = openIndex >= 0 ? entries[openIndex] : null;
  const openedHandling = opened ? newMail.handling[opened.item.id] : undefined;
  return (
    <section
      id="new-mail"
      aria-labelledby="new-mail-title"
      className="min-w-0 scroll-mt-24 overflow-hidden rounded-3xl bg-card ring-1 ring-primary/35 shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_5%,transparent)]"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3.5 sm:px-5">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
        <h2 id="new-mail-title" className="m-0 text-base font-semibold">
          {heading}
        </h2>
        <span className="text-sm text-muted-foreground">
          · arrived {formatDayTime(new Date(newest))}
        </span>
        <ActionForm
          action={markAllJustInfoAction}
          feedback="inverse"
          pendingLabel="Marking"
          className="ml-auto"
        >
          {entries.slice(0, 50).map((entry) => (
            <input key={entry.item.id} type="hidden" name="ids" value={entry.item.id} />
          ))}
          <button
            type="submit"
            className="pressable inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Mark all just info
          </button>
        </ActionForm>
      </header>
      <ul aria-label="New emails" className="m-0 list-none divide-y divide-border p-0">
        {entries.map((entry) => {
          const handling = newMail.handling[entry.item.id];
          return handling ? (
            <TrayEmail
              key={entry.item.id}
              entry={entry}
              handling={handling}
              inbox={inboxOf(entry.item)}
              placeOptions={placeOptions}
              returnTo={returnTo}
              onOpen={() => setOpenId(entry.item.id)}
            />
          ) : null;
        })}
      </ul>
      {newMail.more && (
        <p className="m-0 border-t border-border px-4 py-3 text-sm sm:px-5">
          <Link
            href={`/mail?${new URLSearchParams({ company: companyKey })}`}
            className="font-medium text-link"
          >
            More new emails in Mail
          </Link>
        </p>
      )}
      {opened && (
        <MailDialog
          item={opened.item}
          inbox={inboxOf(opened.item)}
          position={entries.length > 1 ? `${openIndex + 1} of ${entries.length}` : undefined}
          onPrev={openIndex > 0 ? () => setOpenId(entries[openIndex - 1].item.id) : undefined}
          onNext={
            openIndex < entries.length - 1
              ? () => setOpenId(entries[openIndex + 1].item.id)
              : undefined
          }
          onClose={() => setOpenId(null)}
          returnFocus={() =>
            document.querySelector<HTMLElement>(`[data-mail-row="${CSS.escape(opened.item.id)}"]`)
          }
          footer={
            openedHandling ? (
              <HandlingBar
                item={opened.item}
                handling={openedHandling}
                placeOptions={placeOptions}
                returnTo={returnTo}
              />
            ) : null
          }
        />
      )}
    </section>
  );
}
