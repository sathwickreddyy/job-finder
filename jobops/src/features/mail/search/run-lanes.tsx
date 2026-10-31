"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import { formatDayTime } from "@/features/applications/dates";
import type { SearchLane } from "@/features/mail/company-search";
import { includedNote } from "@/features/mail/dropped-list";
import type { IngestItem } from "@/features/mail/ingest";
import { TagPill } from "@/features/mail/tag-pill";
import { cn } from "@/lib/utils";

export type Included = {
  company: string;
  result: {
    addedSender: string | null;
    skippedShared: string | null;
    suggestedKeyword: string | null;
  };
  keywordAdded: boolean;
};

/** After Include this: what happened to the sender, and a keyword to add when it was shared. */
export function IncludedNote({
  company,
  result,
  keywordAdded,
  onAddKeyword,
}: Included & { onAddKeyword: () => void }) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-success-soft px-2.5 py-1.5 text-xs text-foreground">
      <span>{includedNote(company, result)}</span>
      {result.suggestedKeyword &&
        (keywordAdded ? (
          <span className="text-success">Added “{result.suggestedKeyword}” as a keyword.</span>
        ) : (
          <button
            type="button"
            onClick={onAddKeyword}
            className="font-medium text-link hover:underline"
          >
            Add “{result.suggestedKeyword}” as a keyword
          </button>
        ))}
    </p>
  );
}

function StateLine({ lane, pages }: { lane: SearchLane; pages: number }) {
  if (lane.state === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <CircleAlert aria-hidden size={14} />
        Couldn&apos;t search
      </span>
    );
  if (lane.state === "done")
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Check aria-hidden size={14} />
        Done, {pages} {pages === 1 ? "page" : "pages"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-link">
      <Loader2 aria-hidden size={14} className="animate-spin motion-reduce:animate-none" />
      Reading page {pages + 1}
    </span>
  );
}

function Result({
  item,
  note,
  onInclude,
  onAddKeyword,
}: {
  item: IngestItem;
  note?: Included | "pending" | { error: string };
  onInclude: () => void;
  onAddKeyword: () => void;
}) {
  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {item.kept ? (
          <TagPill tag={item.tag ?? "other"} short />
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-border ring-inset">
            <span className="size-1.5 rounded-full bg-muted-foreground" />
          </span>
        )}
        <span className={cn("min-w-0 flex-1 truncate", !item.kept && "text-muted-foreground")}>
          {item.subject}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDayTime(new Date(item.receivedAt))}
        </span>
      </div>
      <p className="m-0 flex min-w-0 flex-wrap gap-x-2 pl-8 text-xs text-muted-foreground">
        <span className="truncate">{item.sender}</span>
        <span>{item.folders.join(", ") || "Mailbox"}</span>
      </p>
      {!item.kept && !(note && typeof note === "object" && "result" in note) && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs">
          <span className="text-foreground">Dropped: {item.reason}</span>
          <button
            type="button"
            disabled={note === "pending"}
            onClick={onInclude}
            className="font-medium text-link hover:underline disabled:opacity-60"
          >
            {note === "pending" ? "Including…" : "Include this"}
          </button>
          {note && typeof note === "object" && "error" in note && (
            <span className="text-destructive">{note.error}</span>
          )}
        </p>
      )}
      {note && typeof note === "object" && "result" in note && (
        <div className="sm:pl-8">
          <IncludedNote {...note} onAddKeyword={onAddKeyword} />
        </div>
      )}
    </li>
  );
}

/** Gallery live search B: one lane per inbox, with its state, counts, query and results. */
export function RunLanes({
  lanes,
  pages,
  notes,
  onInclude,
  onAddKeyword,
}: {
  lanes: SearchLane[];
  pages: Record<string, number>;
  notes: Record<string, Included | "pending" | { error: string }>;
  onInclude: (item: IngestItem) => void;
  onAddKeyword: (item: IngestItem) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {lanes.map((lane) => (
        <section key={lane.account} className="min-w-0 space-y-2 rounded-2xl bg-muted/30 p-3">
          <div className="space-y-1">
            <h4 className="m-0 truncate text-sm font-semibold">{lane.account}</h4>
            <p className="m-0 text-sm">
              <StateLine lane={lane} pages={pages[lane.account] ?? 0} />
            </p>
            {lane.error ? (
              <p className="m-0 text-xs text-destructive">{lane.error}</p>
            ) : (
              <span className="inline-flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                <span>{lane.counts.fetched} read</span>
                <span>{lane.counts.alreadyHere} already here</span>
                <span className="text-success">{lane.counts.kept} kept</span>
                <span>{lane.counts.dropped} dropped</span>
              </span>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Exact search</summary>
              <code className="mt-1 block rounded-lg bg-background px-2 py-1.5 font-mono break-all text-muted-foreground">
                {lane.query}
              </code>
            </details>
          </div>
          {lane.items.length > 0 && (
            <ul className="m-0 list-none divide-y divide-border/60 p-0">
              {lane.items.map((item) => (
                <Result
                  key={item.trackingId}
                  item={item}
                  note={notes[item.trackingId]}
                  onInclude={() => onInclude(item)}
                  onAddKeyword={() => onAddKeyword(item)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
