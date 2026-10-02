"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronRight, Files, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  DefaultBadge,
  FileMark,
  PreviewDialog,
  UseBadge,
  UsagePanel,
  UsageRecord,
} from "./file-ui";
import { submittedCount, type GalleryFamily, type GalleryFile } from "./view-types";

export function ResumeLibrary({
  families,
  layout,
  uploadControl,
  detailLinks = false,
}: {
  families: GalleryFamily[];
  layout: "rows" | "cards" | "grouped";
  uploadControl?: ReactNode;
  detailLinks?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [usedOnly, setUsedOnly] = useState(false);
  const [preview, setPreview] = useState<GalleryFile | null>(null);
  const Heading = detailLinks ? "h1" : "h3";
  const files = families.flatMap((family) => family.files);
  const filtered = files.filter(
    (file) =>
      (!usedOnly || submittedCount(file) > 0) &&
      [
        file.filename,
        file.label,
        file.familyName,
        ...file.uses.flatMap((record) => [record.company, record.role]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-card shadow-surface">
      <header className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <Heading className="m-0 text-xl font-semibold tracking-tight">Your resumes</Heading>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Every version, with the roles it was used for.
          </p>
        </div>
        {uploadControl ?? (
          <Button asChild>
            <a href="#upload">
              <Upload size={16} aria-hidden />
              Upload a resume
            </a>
          </Button>
        )}
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 pb-5 sm:px-6">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
            aria-hidden
          />
          <input
            aria-label={`Search ${layout} resume list`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search file, company or role"
            className="!bg-rail !pl-9 !text-sm"
          />
        </div>
        <div
          role="group"
          aria-label="Filter resume files"
          className="flex rounded-full bg-rail p-1"
        >
          {[false, true].map((used) => (
            <button
              key={String(used)}
              type="button"
              onClick={() => setUsedOnly(used)}
              aria-pressed={usedOnly === used}
              className={cn(
                "min-h-9 rounded-full px-4 text-xs font-medium",
                usedOnly === used
                  ? "bg-selected text-selected-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {used ? "Used in applications" : "All files"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-muted-foreground sm:px-6">
        <span aria-live="polite">
          {filtered.length} file{filtered.length === 1 ? "" : "s"}
        </span>
        <span>“Default” applies to new records.</span>
      </div>
      {layout === "rows" && (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_auto] gap-5 px-4 pb-3 text-xs text-muted-foreground md:grid">
            <span>PDF version</span>
            <span>Company and role</span>
            <span>File</span>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {filtered.map((file) => (
              <article
                key={file.id}
                className="grid items-start gap-4 p-4 transition-colors hover:bg-rail/60 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_auto] md:gap-5"
              >
                <div className="flex min-w-0 gap-4">
                  <FileMark compact />
                  <div className="min-w-0">
                    {detailLinks ? (
                      <Link
                        href={`/resumes/${file.familyId}?version=${file.id}`}
                        className="text-sm font-semibold text-foreground hover:text-primary"
                      >
                        {file.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPreview(file)}
                        className="text-left text-sm font-semibold text-foreground hover:text-primary"
                      >
                        {file.label}
                      </button>
                    )}
                    <p className="m-0 mt-2 break-all text-xs text-muted-foreground">
                      {file.filename}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {file.isDefault && <DefaultBadge />}
                      {file.isArchived && (
                        <span className="text-xs text-muted-foreground">Archived</span>
                      )}
                      <span className="self-center text-[11px] text-muted-foreground">
                        {file.size} · {file.uploaded}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <UseBadge file={file} />
                  {file.uses.length ? (
                    file.uses.map((record) => <UsageRecord key={record.id} record={record} />)
                  ) : (
                    <p className="m-0 mt-3 text-xs text-muted-foreground">
                      No applications use this PDF yet.
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(file)}
                  aria-label={`View ${file.label}`}
                >
                  View file
                  <ChevronRight size={14} aria-hidden />
                </Button>
              </article>
            ))}
          </div>
        </div>
      )}
      {layout === "cards" && (
        <div className="grid gap-4 px-5 pb-6 sm:grid-cols-2 sm:px-6">
          {filtered.map((file) => (
            <article
              key={file.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border transition-colors hover:border-primary"
            >
              <div className="flex items-start gap-4 bg-rail p-5">
                <FileMark />
                <div className="min-w-0 flex-1">
                  <h4 className="m-0 text-base font-semibold leading-snug">{file.label}</h4>
                  <p className="m-0 mt-2 text-xs text-muted-foreground">
                    Uploaded {file.uploaded} · {file.size}
                  </p>
                  {file.isDefault && (
                    <div className="mt-3">
                      <DefaultBadge />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="m-0 break-all text-xs text-muted-foreground">{file.filename}</p>
                <div className="mb-4 mt-4">
                  <UseBadge file={file} />
                </div>
                <UsagePanel file={file} />
                <Button className="mt-5 w-full" variant="outline" onClick={() => setPreview(file)}>
                  Preview this version
                  <ChevronRight size={15} aria-hidden />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {layout === "grouped" && (
        <div className="space-y-4 px-5 pb-6 sm:px-6">
          {families.map((family) => {
            const familyFiles = filtered.filter((file) => file.familyId === family.id);
            if (!familyFiles.length) return null;
            return (
              <section key={family.id} className="overflow-hidden rounded-2xl border border-border">
                <header className="flex items-center gap-3 bg-rail p-4">
                  <Files
                    size={22}
                    strokeWidth={1.5}
                    className="text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <h4 className="m-0 text-sm font-semibold">{family.name}</h4>
                    <p className="m-0 mt-1 text-xs text-muted-foreground">
                      {familyFiles.length} versions shown ·{" "}
                      {family.files.reduce((total, file) => total + submittedCount(file), 0)}{" "}
                      applications across all versions
                    </p>
                  </div>
                </header>
                <div className="divide-y divide-border">
                  {familyFiles.map((file) => (
                    <details key={file.id} open={submittedCount(file) > 0} className="group p-4">
                      <summary className="flex cursor-pointer list-none items-start gap-3 !p-0">
                        <ChevronRight
                          size={16}
                          className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{file.label}</span>
                          <span className="mt-1 block break-all text-xs font-normal text-muted-foreground">
                            {file.filename}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-2">
                            {file.isDefault && <DefaultBadge />}
                            <UseBadge file={file} />
                          </span>
                        </div>
                      </summary>
                      <div className="ml-7 mt-4 grid gap-5 rounded-xl bg-rail p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <UsagePanel file={file} />
                        <Button
                          variant="outline"
                          size="sm"
                          className="self-start"
                          onClick={() => setPreview(file)}
                        >
                          Preview PDF
                        </Button>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {!filtered.length && (
        <div className="px-6 pb-8 pt-4 text-center">
          <Files size={28} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="m-0 font-medium">No matching files</p>
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            Try another company, role or filename.
          </p>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => {
              setQuery("");
              setUsedOnly(false);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <PreviewDialog file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
