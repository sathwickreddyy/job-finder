"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Download,
  FileText,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { submittedCount, type GalleryFile, type ResumeUse } from "./view-types";

export function FileMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-xl bg-rail text-muted-foreground",
        compact ? "size-11" : "size-14",
      )}
    >
      <FileText size={compact ? 22 : 28} strokeWidth={1.4} aria-hidden />
      <span className="absolute -bottom-1 -right-1 rounded-md border border-card bg-secondary px-1.5 text-[9px] font-semibold text-secondary-foreground">
        PDF
      </span>
    </span>
  );
}

export function DefaultBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      Default for new records
    </span>
  );
}

export function UseBadge({ file }: { file: GalleryFile }) {
  const count = submittedCount(file);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        count ? "bg-selected text-selected-foreground" : "bg-rail text-muted-foreground",
      )}
    >
      {count ? <Check size={12} aria-hidden /> : <BriefcaseBusiness size={12} aria-hidden />}
      {count
        ? `${count} application${count === 1 ? "" : "s"}`
        : file.uses.length
          ? `${file.uses.length} outreach / preparing records`
          : "Not sent yet"}
    </span>
  );
}

export function UsageRecord({
  record,
  timeline = false,
}: {
  record: ResumeUse;
  timeline?: boolean;
}) {
  return (
    <Link
      href={`/applications/${record.id}`}
      className={cn(
        "group block rounded-xl p-3 text-foreground hover:bg-muted/50 hover:no-underline",
        timeline && "relative ml-1 border-l-2 border-primary/40 pl-5",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground"
          aria-hidden
        >
          {record.company.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 font-semibold">{record.company}</p>
            <span className="rounded-full bg-selected px-2.5 py-0.5 text-[11px] text-selected-foreground">
              {record.outcome}
            </span>
          </div>
          <p className="m-0 mt-1 text-sm leading-relaxed">{record.role}</p>
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            {record.method}
            {record.date ? ` on ${record.date}` : ""}
          </p>
        </div>
        <ArrowUpRight
          size={15}
          className="mt-1 shrink-0 text-muted-foreground group-hover:text-primary"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function CompactUsageRow({ record }: { record: ResumeUse }) {
  const detail = [record.role, record.date].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`/applications/${record.id}`}
        title={`${record.company}: ${record.role} (${record.outcome})`}
        className="group flex items-center gap-2.5 rounded-xl px-3 py-2 text-foreground hover:bg-muted/50 hover:no-underline"
      >
        <span
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground"
          aria-hidden
        >
          {record.company.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold">{record.company}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-px text-[10px] font-medium",
                record.submitted || record.outcome === "Sent"
                  ? "bg-selected text-selected-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {record.outcome}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
        </span>
        <ArrowUpRight
          size={14}
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </Link>
    </li>
  );
}

/**
 * One line per record, sent applications first. Long histories collapse behind
 * "Show all" and gain a filter, so a busy file never pushes the page down.
 */
export function CompactUsageList({ uses, initial = 4 }: { uses: ResumeUse[]; initial?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const filterable = expanded && uses.length > 8;
  const needle = query.trim().toLowerCase();
  const matching =
    filterable && needle
      ? uses.filter((record) => `${record.company} ${record.role}`.toLowerCase().includes(needle))
      : uses;
  const shown = expanded ? matching : uses.slice(0, initial);
  const hidden = uses.length - initial;
  return (
    <div className="-mx-3 mt-2">
      {filterable && (
        <div className="relative mx-3 mb-2">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            aria-label="Filter companies"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter companies or roles"
            className="!h-8 !rounded-full !border-border !bg-card !pl-8 !text-xs"
          />
        </div>
      )}
      <ul
        className={cn(
          "m-0 list-none space-y-0.5 p-0",
          expanded && "max-h-[420px] overflow-y-auto overscroll-contain",
        )}
      >
        {shown.map((record) => (
          <CompactUsageRow key={record.id} record={record} />
        ))}
      </ul>
      {filterable && needle && !matching.length && (
        <p className="m-0 px-3 py-2 text-xs text-muted-foreground">No matching records.</p>
      )}
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            setQuery("");
          }}
          className="mx-3 mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-link hover:bg-muted/60"
        >
          <ChevronDown
            size={14}
            className={cn("transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
          {expanded ? "Show fewer" : `Show all ${uses.length}`}
        </button>
      )}
    </div>
  );
}

export function UsagePanel({ file, timeline = false }: { file: GalleryFile; timeline?: boolean }) {
  return (
    <section aria-label={`Applications using ${file.label}`} className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold">Where this file was used</h3>
        <span className="text-xs text-muted-foreground">
          {file.uses.length} record{file.uses.length === 1 ? "" : "s"}
        </span>
      </div>
      {file.uses.length ? (
        <div className="space-y-2">
          {file.uses.map((record) => (
            <UsageRecord key={record.id} record={record} timeline={timeline} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-rail p-5">
          <BriefcaseBusiness
            size={22}
            strokeWidth={1.5}
            className="mb-3 text-muted-foreground"
            aria-hidden
          />
          <p className="m-0 text-sm font-medium">This version hasn’t been sent.</p>
          <p className="m-0 mt-2 text-xs leading-relaxed text-muted-foreground">
            Each version has its own history. Choose another file above to see its applications.
          </p>
        </div>
      )}
    </section>
  );
}

export function PdfPreview({ file, height = "h-[480px]" }: { file: GalleryFile; height?: string }) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          Preview depends on your browser’s PDF support.
        </span>
        <a
          href={`/api/resumes/${file.id}/file`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary"
        >
          Open PDF <ArrowUpRight size={14} aria-hidden />
        </a>
      </div>
      <iframe
        key={file.id}
        title={`PDF preview: ${file.label}`}
        loading="lazy"
        src={`/api/resumes/${file.id}/file#toolbar=0&navpanes=0`}
        className={cn("w-full rounded-xl border border-border bg-card", height)}
      />
    </div>
  );
}

export function FileActions({ file }: { file: GalleryFile }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" asChild>
        <a href={`/api/resumes/${file.id}/file?download=1`}>
          <Download size={14} aria-hidden />
          Download PDF
        </a>
      </Button>
      <Button size="sm" variant="ghost" asChild>
        <Link href={`/resumes?file=${file.id}`}>
          Open file details
          <ArrowUpRight size={14} aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

export function PreviewDialog({
  file,
  onClose,
}: {
  file: GalleryFile | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (file && !dialog.current?.open) dialog.current?.showModal();
    if (!file && dialog.current?.open) dialog.current.close();
  }, [file]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label="Resume preview"
      className="m-auto max-h-[90dvh] w-[min(66rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-panel border border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
    >
      {file && (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div className="min-w-0">
              <h2 className="m-0 text-lg font-semibold">{file.label}</h2>
              <p className="m-0 mt-2 break-all text-xs text-muted-foreground">{file.filename}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close resume preview">
              <X size={20} aria-hidden />
            </Button>
          </header>
          <div className="grid items-start gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <PdfPreview file={file} />
            <div className="space-y-6">
              <UseBadge file={file} />
              <UsagePanel file={file} />
              <FileActions file={file} />
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
