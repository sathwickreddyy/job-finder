"use client";

import { useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { TagPill } from "@/features/mail/tag-pill";
import { cn } from "@/lib/utils";
import type { PolishMail } from "./data";
import { clock, previewLine } from "./shared";

export type RowStyle = "lines" | "subject" | "columns";

const unusual = /junk|spam|trash|deleted/i;

/** Which inbox: its domain, plus the folder when the email sat in Junk, Spam or Trash. */
export function InboxChip({ mail, className }: { mail: PolishMail; className?: string }) {
  const odd = unusual.test(mail.folder);
  return (
    <span
      title={`Found in your ${mail.inbox} inbox, ${mail.folder}`}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs whitespace-nowrap",
        odd ? "bg-warning-soft text-warning" : "text-muted-foreground",
        className,
      )}
    >
      <Inbox aria-hidden size={12} className="shrink-0" />
      <span>{odd ? `${mail.inbox}, ${mail.folder}` : mail.inbox}</span>
    </span>
  );
}

function Body({ mail }: { mail: PolishMail }) {
  return (
    <div className="reveal mx-3 mb-3 rounded-2xl bg-muted/45 p-4 sm:mx-4">
      <p className="m-0 flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{mail.senderName}</span>
        <span className="truncate">{mail.sender}</span>
      </p>
      <p className="m-0 mt-2 max-w-prose text-sm leading-relaxed break-words whitespace-pre-wrap">
        {mail.text.replace(/[​-‏⁠﻿]/g, "").replace(/\n\s*\n\s*\n/g, "\n\n")}
      </p>
    </div>
  );
}

const press =
  "w-full min-w-0 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none";

function Lines({ mail }: { mail: PolishMail }) {
  const preview = previewLine(mail.text);
  return (
    <span className="grid gap-1 px-4 py-3">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span className={cn("truncate", mail.open ? "font-semibold" : "font-medium")}>
          {mail.company}
        </span>
        <span className="truncate text-xs text-muted-foreground">{mail.senderName}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <InboxChip mail={mail} className="hidden sm:inline-flex" />
          <span className="text-xs text-muted-foreground tabular-nums">{clock(mail.at)}</span>
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <TagPill tag={mail.tag} />
        <span className={cn("truncate text-sm", mail.open && "font-medium")}>{mail.subject}</span>
      </span>
      {preview && <span className="line-clamp-1 text-xs text-muted-foreground">{preview}</span>}
    </span>
  );
}

function Subject({ mail }: { mail: PolishMail }) {
  return (
    <span className="grid gap-1.5 px-4 py-3">
      <span className="flex min-w-0 items-baseline gap-3">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[15px]",
            mail.open ? "font-semibold" : "font-medium",
          )}
        >
          {mail.subject}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {clock(mail.at)}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <TagPill tag={mail.tag} />
        <span className="truncate">
          <span className="font-medium text-foreground">{mail.company}</span>, {mail.senderName}
        </span>
        <InboxChip mail={mail} className="ml-auto hidden sm:inline-flex" />
      </span>
    </span>
  );
}

function Columns({ mail }: { mail: PolishMail }) {
  const preview = previewLine(mail.text);
  return (
    <span className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[9.5rem_10rem_minmax(0,1fr)_auto] sm:items-start">
      <span className="flex items-center justify-between gap-2 sm:block">
        <TagPill tag={mail.tag} />
        <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
          {clock(mail.at)}
        </span>
      </span>
      <span className="grid min-w-0">
        <span className={cn("truncate text-sm", mail.open ? "font-semibold" : "font-medium")}>
          {mail.company}
        </span>
        <span className="truncate text-xs text-muted-foreground">{mail.senderName}</span>
      </span>
      <span className="grid min-w-0">
        <span className={cn("truncate text-sm", mail.open && "font-medium")}>{mail.subject}</span>
        {preview && <span className="truncate text-xs text-muted-foreground">{preview}</span>}
      </span>
      <span className="hidden justify-items-end text-xs text-muted-foreground tabular-nums sm:grid">
        <span>{clock(mail.at)}</span>
        <InboxChip mail={mail} className="-mr-1.5" />
      </span>
    </span>
  );
}

/** One email that opens in place; open (needs-you) mail carries a blue edge and bold text. */
export function PolishRow({
  mail,
  style = "lines",
  lead,
  className,
}: {
  mail: PolishMail;
  style?: RowStyle;
  /** Something before the row, such as a date stub on a card. */
  lead?: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const Content = style === "subject" ? Subject : style === "columns" ? Columns : Lines;
  return (
    <li className={cn("relative", className)}>
      {mail.open && (
        <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" />
      )}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className={cn(press, lead && "grid grid-cols-[auto_minmax(0,1fr)] items-stretch")}
      >
        {lead}
        <Content mail={mail} />
        <span className="sr-only">{mail.open ? ", needs you" : ""}</span>
      </button>
      {expanded && <Body mail={mail} />}
    </li>
  );
}
