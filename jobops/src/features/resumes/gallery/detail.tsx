"use client";

import { useState } from "react";
import { Check, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DefaultBadge, FileActions, FileMark, PdfPreview, UseBadge, UsagePanel } from "./shared";
import { initialFile, type GalleryFile } from "./types";

function Notes({ file }: { file: GalleryFile }) {
  return (
    <div className="space-y-4 border-t border-border pt-5">
      <details>
        <summary className="!py-0 text-sm font-medium">
          Bullet changes{file.changeNotes ? "" : " · none recorded"}
        </summary>
        <p className="m-0 mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {file.changeNotes ||
            "The original wording is preserved. Add a change log when uploading a revision."}
        </p>
      </details>
      <p className="m-0 text-xs text-muted-foreground">
        {file.textExtracted ? "Selectable text extracted" : "Text extraction needs review"} ·{" "}
        {file.assessmentCount
          ? `${file.assessmentCount} saved assessment${file.assessmentCount === 1 ? "" : "s"}`
          : "No ATS assessment recorded"}
      </p>
    </div>
  );
}

export function ResumeDetailPreview({
  files,
  layout,
}: {
  files: GalleryFile[];
  layout: "split" | "history";
}) {
  const [selectedId, setSelectedId] = useState(initialFile(files)?.id);
  const [tab, setTab] = useState("usage");
  const selected = files.find((file) => file.id === selectedId) ?? files[0];
  if (!selected)
    return (
      <p className="rounded-panel border border-border bg-card p-8 text-muted-foreground">
        Upload a resume to try the file workspace.
      </p>
    );
  const chooseFile = (file: GalleryFile) => {
    setSelectedId(file.id);
    setTab("usage");
  };
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-card shadow-surface">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
        <div className="min-w-0">
          <p className="m-0 text-xs text-muted-foreground">{selected.familyName}</p>
          <h3 className="m-0 mt-2 text-xl font-semibold leading-tight tracking-tight">
            {selected.label}
          </h3>
          <p className="m-0 mt-3 max-w-2xl break-all text-xs text-muted-foreground">
            {selected.filename}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <UseBadge file={selected} />
            {selected.isDefault && <DefaultBadge />}
          </div>
        </div>
        <FileActions file={selected} />
      </header>
      {layout === "split" ? (
        <>
          <div
            role="group"
            aria-label="Choose a version in split preview"
            className="flex gap-2 overflow-x-auto border-b border-border bg-rail/50 p-4 sm:px-6"
          >
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                aria-pressed={file.id === selected.id}
                onClick={() => chooseFile(file)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-medium",
                  file.id === selected.id
                    ? "border-primary bg-selected text-selected-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                <FileText size={14} aria-hidden />
                {file.label}
                {file.id === selected.id && <Check size={13} aria-hidden />}
              </button>
            ))}
          </div>
          <div className="grid items-start gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <PdfPreview file={selected} />
            <aside className="min-w-0 space-y-6">
              <UsagePanel file={selected} />
              <Notes file={selected} />
            </aside>
          </div>
        </>
      ) : (
        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside
            aria-label="Versions in history preview"
            className="space-y-2 border-b border-border bg-rail/50 p-4 lg:border-b-0 lg:border-r"
          >
            <p className="m-0 mb-3 px-2 text-xs text-muted-foreground">Choose a file</p>
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                aria-pressed={file.id === selected.id}
                onClick={() => chooseFile(file)}
                className={cn(
                  "flex w-full gap-3 rounded-2xl border p-3 text-left",
                  file.id === selected.id
                    ? "border-primary bg-selected text-selected-foreground"
                    : "border-transparent hover:bg-muted",
                )}
              >
                <FileMark compact />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold leading-relaxed">{file.label}</span>
                  <span className="mt-2 block text-[11px] text-muted-foreground">
                    {file.isDefault ? "Default file" : file.uploaded}
                  </span>
                  <span className="mt-2 block text-[11px]">
                    {file.uses.length} linked record{file.uses.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            ))}
          </aside>
          <div className="min-w-0 p-5 sm:p-6">
            <div
              role="group"
              aria-label="History preview view"
              className="mb-6 flex gap-1 rounded-full bg-rail p-1"
            >
              {[
                ["usage", "Applications"],
                ["file", "PDF preview"],
                ["changes", "Changes and assessments"],
              ].map(([key, name]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "min-h-10 flex-1 rounded-full px-3 text-xs font-medium",
                    tab === key
                      ? "bg-selected text-selected-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            {tab === "usage" && (
              <>
                <p className="m-0 mb-5 max-w-xl text-sm text-muted-foreground">
                  The application history for this exact PDF stays visible before you open its
                  preview.
                </p>
                <UsagePanel file={selected} timeline />
                <div className="mt-6">
                  <Notes file={selected} />
                </div>
              </>
            )}
            {tab === "file" && <PdfPreview file={selected} height="h-[460px]" />}
            {tab === "changes" && <Notes file={selected} />}
          </div>
        </div>
      )}
    </div>
  );
}
