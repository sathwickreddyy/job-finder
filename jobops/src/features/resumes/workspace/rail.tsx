"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { submittedCount, type GalleryFamily, type GalleryFile } from "../view-types";

export type RailVariant = "grouped" | "lineage" | "sent";

export function defaultFile(files: GalleryFile[]) {
  return files.find((file) => file.isDefault) ?? files[0];
}

function matches(file: GalleryFile, query: string) {
  return [
    file.filename,
    file.label,
    file.familyName,
    ...file.uses.flatMap((record) => [record.company, record.role]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function Companies({ file, size = "sm" }: { file: GalleryFile; size?: "sm" | "md" }) {
  const companies = [...new Set(file.uses.map((record) => record.company))];
  if (!companies.length) return null;
  return (
    <span className="flex -space-x-1.5" aria-label={`Used for ${companies.join(", ")}`}>
      {companies.slice(0, 3).map((company) => (
        <span
          key={company}
          title={company}
          className={cn(
            "grid place-items-center rounded-lg border-2 border-card bg-secondary font-semibold text-secondary-foreground",
            size === "md" ? "size-8 text-xs" : "size-6 text-[10px]",
          )}
        >
          {company.slice(0, 1)}
        </span>
      ))}
      {companies.length > 3 && (
        <span className="grid size-6 place-items-center rounded-lg border-2 border-card bg-muted text-[10px]">
          +{companies.length - 3}
        </span>
      )}
    </span>
  );
}

function Row({
  file,
  selected,
  href,
  onSelect,
  className,
  children,
}: {
  file: GalleryFile;
  selected: boolean;
  href?: string;
  onSelect?: (file: GalleryFile) => void;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "block w-full rounded-2xl px-3 py-2.5 text-left text-foreground transition-colors hover:no-underline",
    selected ? "bg-selected text-selected-foreground" : "hover:bg-muted/60",
    className,
  );
  if (href)
    return (
      <Link
        href={href}
        scroll={false}
        aria-current={selected ? "true" : undefined}
        className={classes}
      >
        {children}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={() => onSelect?.(file)}
      aria-current={selected ? "true" : undefined}
      className={classes}
    >
      {children}
    </button>
  );
}

function UseCount({ file }: { file: GalleryFile }) {
  const count = submittedCount(file);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        count ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
      title={`${count} application${count === 1 ? "" : "s"}`}
    >
      {count}
    </span>
  );
}

function DefaultMark() {
  return (
    <span className="rounded-full border border-current/30 px-2 py-px text-[10px] font-medium opacity-80">
      Default
    </span>
  );
}

function GroupedRows({ files, ...row }: RowsProps) {
  return (
    <div className="space-y-1">
      {files.map((file) => (
        <Row
          key={file.id}
          file={file}
          selected={row.selectedId === file.id}
          {...rowLink(row, file)}
        >
          <span className="flex items-start justify-between gap-3">
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug">
              {file.label}
            </span>
            <UseCount file={file} />
          </span>
          <span className="mt-1.5 flex items-center gap-2 text-[11px] opacity-75">
            {file.uploaded}
            {file.isDefault && <DefaultMark />}
          </span>
        </Row>
      ))}
    </div>
  );
}

function LineageRows({ files, ...row }: RowsProps) {
  return (
    <ol className="relative m-0 list-none p-0 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-0.5 before:rounded-full before:bg-border">
      {files.map((file, index) => {
        const selected = row.selectedId === file.id;
        const root = index === files.length - 1;
        return (
          <li key={file.id} className="relative pl-8">
            <span
              aria-hidden
              className={cn(
                "absolute left-[9px] top-[18px] z-10 rounded-full border-2",
                root ? "size-3.5 rounded-[4px]" : "size-3.5",
                selected
                  ? "border-primary bg-primary"
                  : file.isDefault
                    ? "border-primary bg-card"
                    : "border-input bg-card",
              )}
            />
            <Row file={file} selected={selected} {...rowLink(row, file)} className="my-0.5">
              <span className="line-clamp-2 text-[13px] font-semibold leading-snug">
                {file.label}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] opacity-75">
                {root ? `Started ${file.uploaded}` : `Revised ${file.uploaded}`}
                {file.isDefault && <DefaultMark />}
              </span>
              {file.uses.length > 0 && (
                <span className="mt-2 flex items-center gap-2 text-[11px]">
                  <Companies file={file} />
                  <span className="opacity-80">
                    {submittedCount(file)
                      ? `Sent to ${[...new Set(file.uses.map((use) => use.company))].join(", ")}`
                      : "Preparing"}
                  </span>
                </span>
              )}
            </Row>
          </li>
        );
      })}
    </ol>
  );
}

function SentRows({ files, ...row }: RowsProps) {
  return (
    <div className="space-y-1">
      {files.map((file) => (
        <Row
          key={file.id}
          file={file}
          selected={row.selectedId === file.id}
          {...rowLink(row, file)}
          className="flex gap-3"
        >
          <span className="w-8 shrink-0 pt-0.5">
            {file.uses.length ? (
              <Companies file={file} size="md" />
            ) : (
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-lg border-2 border-dashed border-border"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium opacity-80">
              {file.uses.length
                ? [...new Set(file.uses.map((use) => use.company))].join(", ")
                : "Not sent yet"}
            </span>
            <span className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug">
              {file.label}
            </span>
            <span className="mt-1.5 flex items-center gap-2 text-[11px] opacity-75">
              {file.uploaded}
              {file.isDefault && <DefaultMark />}
            </span>
          </span>
        </Row>
      ))}
    </div>
  );
}

type RowsProps = {
  files: GalleryFile[];
  selectedId?: string;
  linkBase?: string;
  onSelect?: (file: GalleryFile) => void;
};

function rowLink(row: Omit<RowsProps, "files">, file: GalleryFile) {
  return {
    href: row.linkBase === undefined ? undefined : `${row.linkBase}file=${file.id}`,
    onSelect: row.onSelect,
  };
}

export function ResumeRail({
  families,
  selectedId,
  variant,
  linkBase,
  selectedFamilyId,
  onSelect,
  action,
  footer,
}: {
  families: GalleryFamily[];
  selectedId?: string;
  variant: RailVariant;
  /** Production rows link to `${linkBase}file=<id>`; the gallery uses onSelect instead. */
  linkBase?: string;
  selectedFamilyId?: string;
  onSelect?: (file: GalleryFile) => void;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [usedOnly, setUsedOnly] = useState(false);
  const Rows = variant === "lineage" ? LineageRows : variant === "sent" ? SentRows : GroupedRows;
  const groups = families
    .map((family) => ({
      family,
      files: family.files.filter(
        (file) => (!usedOnly || submittedCount(file) > 0) && matches(file, query),
      ),
    }))
    .filter(
      (group) => group.files.length || (!group.family.files.length && !query.trim() && !usedOnly),
    );
  return (
    <nav aria-label="Resume files" className="flex h-full min-w-0 flex-col gap-4 p-4">
      {action}
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-[13px] text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          aria-label="Search resume files"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="File, company or role"
          className="!rounded-full !border-border !bg-card !pl-9 !text-[13px]"
        />
      </div>
      <div role="group" aria-label="Filter resume files" className="flex gap-2">
        {[
          [false, "All files"],
          [true, "Sent"],
        ].map(([used, text]) => (
          <button
            key={String(used)}
            type="button"
            aria-pressed={usedOnly === used}
            onClick={() => setUsedOnly(used as boolean)}
            className={cn(
              "h-8 rounded-lg border px-3 text-xs font-medium transition-colors",
              usedOnly === used
                ? "border-transparent bg-selected text-selected-foreground"
                : "border-border text-muted-foreground hover:bg-muted/60",
            )}
          >
            {text as string}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-5">
        {groups.map(({ family, files }) => (
          <section key={family.id} aria-label={family.name}>
            <h2 className="m-0 mb-2 flex items-baseline justify-between gap-2 px-3 text-xs font-medium text-muted-foreground">
              <span className="truncate">{family.name}</span>
              {family.isArchived ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-px text-[10px]">
                  Archived
                </span>
              ) : (
                <span className="shrink-0 tabular-nums">{family.files.length}</span>
              )}
            </h2>
            {files.length ? (
              <Rows files={files} selectedId={selectedId} linkBase={linkBase} onSelect={onSelect} />
            ) : (
              linkBase !== undefined && (
                <Link
                  href={`${linkBase}resume=${family.id}&upload=1`}
                  scroll={false}
                  aria-current={selectedFamilyId === family.id ? "true" : undefined}
                  className={cn(
                    "block rounded-2xl border border-dashed border-border px-3 py-2.5 text-xs font-medium hover:no-underline",
                    selectedFamilyId === family.id
                      ? "bg-selected text-selected-foreground"
                      : "text-link hover:bg-muted/60",
                  )}
                >
                  Upload its first PDF
                </Link>
              )
            )}
          </section>
        ))}
        {!families.length && (
          <p className="m-0 px-3 py-4 text-sm leading-relaxed text-muted-foreground">
            No resumes yet. Upload your original PDF to start.
          </p>
        )}
        {families.length > 0 && !groups.length && (
          <div className="px-3 py-6 text-center">
            <p className="m-0 text-sm font-medium">No matching files</p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-link"
              onClick={() => {
                setQuery("");
                setUsedOnly(false);
              }}
            >
              Clear search
            </button>
          </div>
        )}
      </div>
      {footer}
    </nav>
  );
}

export function FileStrip({
  families,
  selectedId,
  onSelect,
  action,
}: {
  families: GalleryFamily[];
  selectedId?: string;
  onSelect: (file: GalleryFile) => void;
  action?: ReactNode;
}) {
  return (
    <nav aria-label="Resume files" className="flex items-end gap-3 overflow-x-auto p-3">
      {families.map((family) => (
        <section key={family.id} aria-label={family.name} className="shrink-0">
          <h2 className="m-0 mb-2 px-1 text-xs font-medium text-muted-foreground">{family.name}</h2>
          <div className="flex items-stretch gap-2">
            {family.files.map((file) => {
              const selected = file.id === selectedId;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => onSelect(file)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-56 shrink-0 flex-col justify-between rounded-2xl border px-3.5 py-2.5 text-left transition-colors",
                    selected
                      ? "border-transparent bg-selected text-selected-foreground"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug">
                      {file.label}
                    </span>
                    <UseCount file={file} />
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-[11px] opacity-75">
                    {file.uploaded}
                    {file.isDefault && <DefaultMark />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {action}
    </nav>
  );
}
