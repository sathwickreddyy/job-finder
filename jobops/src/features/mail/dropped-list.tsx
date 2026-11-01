"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDayTime } from "@/features/applications/dates";
import { cn } from "@/lib/utils";
import type { IngestItem } from "./ingest";
import { droppedMail, includeDroppedMail } from "./workspace-actions";

/** What Include this did with the sender, in the panel's words. */
export function includedNote(
  company: string,
  result: { addedSender: string | null; skippedShared: string | null },
) {
  if (result.addedSender)
    return `Kept for ${company}. Added ${result.addedSender} to ${company}'s addresses.`;
  if (result.skippedShared)
    return `Kept for ${company}. ${result.skippedShared} is shared by many companies, so it wasn't added to ${company}'s addresses.`;
  return `Kept for ${company}.`;
}

function Row({
  item,
  company,
  companies,
}: {
  item: IngestItem;
  company?: string;
  companies: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const known = company ?? (item.companyKeys.length === 1 ? item.companyKeys[0] : "");
  const [choice, setChoice] = useState(known);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const nameOf = (key: string) => companies.find((row) => row.key === key)?.name ?? key;
  function include() {
    if (!choice) return;
    startTransition(async () => {
      const result = await includeDroppedMail(item.trackingId, choice);
      if (result.error || !result.included) setError(result.error ?? "Include this failed. Retry.");
      else {
        setError("");
        setNote(includedNote(nameOf(choice), result.included));
        router.refresh();
      }
    });
  }
  return (
    <li className="space-y-1 rounded-2xl px-3 py-2.5 ring-1 ring-border">
      <p className="m-0 flex min-w-0 items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{item.subject}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDayTime(new Date(item.receivedAt))}
        </span>
      </p>
      <p className="m-0 truncate text-xs text-muted-foreground">
        {item.senderName ? `${item.senderName} <${item.sender}>` : item.sender} ·{" "}
        {item.folders.join(", ") || "Mailbox"}
      </p>
      <p className="m-0 text-xs">
        <span className="text-muted-foreground">Dropped: </span>
        {item.reason}
      </p>
      {note ? (
        <p role="status" className="m-0 text-xs text-success">
          {note}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!known && (
            <label className="inline-flex items-center gap-1.5 text-xs">
              Which company?
              <select
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
                className="h-8! min-h-8! rounded-full! py-0! text-xs"
              >
                <option value="">Choose</option>
                {companies.map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={pending || !choice}
            onClick={include}
            className="pressable inline-flex h-8 items-center rounded-full bg-selected px-3 text-xs font-medium text-selected-foreground disabled:opacity-60"
          >
            {pending ? "Including…" : "Include this"}
          </button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}
    </li>
  );
}

/** Dropped mail decided since a time, each with its reason and Include this. */
export function DroppedList({
  since,
  company,
  companies,
  className,
}: {
  since: string;
  company?: string;
  companies: { key: string; name: string }[];
  className?: string;
}) {
  const [items, setItems] = useState<IngestItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    droppedMail(since, company).then((result) => {
      if (!live) return;
      if (result.error) setError(result.error);
      else setItems(result.items ?? []);
    });
    return () => {
      live = false;
    };
  }, [since, company]);
  if (error) return <p className="m-0 text-sm text-destructive">{error}</p>;
  if (!items) return <p className="m-0 text-sm text-muted-foreground">Loading dropped mail…</p>;
  if (!items.length)
    return <p className="m-0 text-sm text-muted-foreground">Nothing was dropped.</p>;
  return (
    <ul className={cn("m-0 grid list-none gap-2 p-0", className)}>
      {items.map((item) => (
        <Row key={item.trackingId} item={item} company={company} companies={companies} />
      ))}
    </ul>
  );
}
