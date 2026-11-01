"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { formatDayTime } from "@/features/applications/dates";
import { inboxLabels, previewLine } from "@/features/mail/row-text";
import { TagPill } from "@/features/mail/tag-pill";
import { EditTag } from "@/features/timeline/edit-tag";
import { HandledLine, HandlingBar, type PlaceOptions } from "@/features/timeline/handling";
import { mailHref, type MailQuery } from "@/features/timeline/query";
import type { AttentionMail } from "./read";

export function AttentionFeed({
  data,
  query = {},
  compact = false,
  inboxes = [],
  placeOptions,
}: {
  data: AttentionMail;
  query?: Partial<MailQuery>;
  compact?: boolean;
  inboxes?: string[];
  placeOptions?: PlaceOptions;
}) {
  const entries = compact ? data.entries.slice(0, 2) : data.entries;
  useEffect(() => {
    if (!compact && query.mail && window.matchMedia("(max-width: 767px)").matches)
      document.getElementById(`attention-${query.mail}`)?.scrollIntoView({ block: "nearest" });
  }, [compact, query.mail]);
  const labels = inboxLabels([...inboxes, ...entries.map((entry) => entry.item.account)]);
  return (
    <div className="space-y-3">
      {!entries.length && (
        <div className="rounded-3xl bg-card p-6 text-center ring-1 ring-border">
          <Check size={24} aria-hidden className="mx-auto mb-3 text-link" />
          <p className="m-0 font-semibold">You’re all caught up</p>
          <p className="m-0 mt-1 text-sm text-muted-foreground">No mail needs your attention.</p>
        </div>
      )}
      {entries.length > 0 && (
        <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-3xl bg-card p-0 ring-1 ring-border">
          {entries.map((entry) => {
            const { item } = entry;
            const open = !compact && query.mail === item.id;
            return (
              <li key={item.id} id={`attention-${item.id}`} className="scroll-mt-24">
                <Link
                  href={mailHref({ ...query, mail: open ? null : item.id })}
                  scroll={false}
                  aria-expanded={compact ? undefined : open}
                  className="block min-w-0 space-y-2 px-4 py-4 text-foreground hover:bg-muted/35 hover:no-underline"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {item.company?.name ?? (item.senderName || item.sender)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDayTime(new Date(item.receivedAt))}
                    </span>
                  </span>
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                        {item.subject || "(no subject)"}
                      </span>
                      <span className="mt-1 block line-clamp-1 text-xs text-muted-foreground">
                        {previewLine(item.text)}
                      </span>
                    </span>
                    {open ? (
                      <ChevronDown
                        size={16}
                        aria-hidden
                        className="mt-1 shrink-0 text-muted-foreground"
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                        aria-hidden
                        className="mt-1 shrink-0 text-muted-foreground"
                      />
                    )}
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <TagPill tag={item.tag} />
                    <span className="text-[10px] text-muted-foreground">
                      {labels[item.account] ?? item.account}
                    </span>
                  </span>
                </Link>
                {open && (
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {item.senderName} {item.sender}
                      {item.folders.length > 0 && ` · ${item.folders.join(", ")}`}
                    </p>
                    <p className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {item.text}
                    </p>
                    <EditTag item={item} />
                    {item.attention === "open" ? (
                      <HandlingBar
                        item={item}
                        handling={data.handling[item.id]}
                        placeOptions={placeOptions}
                        infoLabel="Mark as handled"
                      />
                    ) : (
                      <HandledLine item={item} recorded={entry.recorded} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!compact && data.nextCursor && (
        <Link
          href={mailHref({ ...query, mail: null, cursor: data.nextCursor })}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-link hover:bg-selected hover:no-underline"
        >
          Show older attention mail
        </Link>
      )}
    </div>
  );
}
