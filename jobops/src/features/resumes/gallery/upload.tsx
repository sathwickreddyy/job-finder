"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Check, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { GalleryFamily } from "./types";

function UploadForm({ families, close }: { families: GalleryFamily[]; close?: () => void }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  function choose(next: File | undefined) {
    setPreview(false);
    if (!next) {
      setFile(null);
      return;
    }
    if (!/\.pdf$/i.test(next.name) || (next.type && next.type !== "application/pdf")) {
      setError("Choose a PDF file.");
      setFile(null);
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("Choose a PDF smaller than 10 MiB.");
      setFile(null);
      return;
    }
    setError("");
    setFile(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (file && label.trim()) setPreview(true);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={`${id}-family`} className="text-sm">
          Add this file to
        </label>
        <select id={`${id}-family`} defaultValue={families[0]?.id ?? "new"}>
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name} · new version
            </option>
          ))}
          <option value="new">A new resume</option>
        </select>
      </div>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files[0]);
        }}
        className={cn(
          "rounded-2xl border border-dashed p-5 text-center",
          file ? "border-primary bg-selected/30" : "border-input bg-rail/40",
        )}
      >
        {file ? (
          <FileText size={28} strokeWidth={1.5} className="mx-auto text-primary" aria-hidden />
        ) : (
          <Upload
            size={28}
            strokeWidth={1.5}
            className="mx-auto text-muted-foreground"
            aria-hidden
          />
        )}
        <label htmlFor={`${id}-file`} className="mt-3 block text-sm font-medium">
          {file ? file.name : "Drop your PDF here, or choose a file"}
        </label>
        <p className="m-0 mb-4 mt-2 text-xs text-muted-foreground">
          {file
            ? `${(file.size / 1024).toFixed(1)} KB · ready to preview`
            : "PDF up to 10 MiB. Originals are kept separately."}
        </p>
        <input
          id={`${id}-file`}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => choose(event.target.files?.[0])}
          className="!border-0 !bg-transparent !p-0 !text-xs file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-secondary-foreground"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-label`} className="text-sm">
          Version name
        </label>
        <input
          id={`${id}-label`}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            setPreview(false);
          }}
          required
          maxLength={80}
          placeholder="Company, role or what changed"
        />
      </div>
      <details>
        <summary className="text-sm font-medium">Bullet changes and default setting</summary>
        <div className="mt-3 space-y-4">
          <label htmlFor={`${id}-notes`} className="block text-xs text-muted-foreground">
            What changed in this version?
          </label>
          <textarea
            id={`${id}-notes`}
            rows={3}
            placeholder="Original wording, revised wording and confirmed facts"
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" />
            Use this file for new records by default
          </label>
          <p className="m-0 text-xs text-muted-foreground">
            Existing applications keep the PDF you submitted.
          </p>
        </div>
      </details>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-action">
          {error}
        </p>
      )}
      {preview && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-selected p-3 text-sm text-selected-foreground"
        >
          <Check size={17} className="mt-0.5 shrink-0" aria-hidden />
          <span>Preview ready: {label}. This gallery hasn’t saved or uploaded the file.</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button disabled={!file || !label.trim()}>Preview upload</Button>
        {close && (
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
        )}
        <span className="text-xs text-muted-foreground">Gallery demo only</span>
      </div>
    </form>
  );
}

export function UploadPreview({
  families,
  layout,
}: {
  families: GalleryFamily[];
  layout: "drawer" | "inline";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  if (layout === "inline")
    return (
      <div className="grid overflow-hidden rounded-panel border border-border bg-card shadow-surface lg:grid-cols-[0.75fr_1fr]">
        <div className="border-b border-border bg-rail/50 p-6 lg:border-b-0 lg:border-r">
          <Upload size={26} strokeWidth={1.4} className="mb-5 text-primary" aria-hidden />
          <h3 className="m-0 text-xl font-semibold tracking-tight">Add a revised PDF</h3>
          <p className="m-0 mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Give each file a clear name. Keep its changes and the roles it was used for together.
          </p>
          <div className="mt-6 space-y-4">
            {families.map((family) => (
              <div key={family.id} className="rounded-xl border border-border bg-card p-4">
                <p className="m-0 text-sm font-medium">{family.name}</p>
                <p className="m-0 mt-2 text-xs text-muted-foreground">
                  {family.files.length} saved versions
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <UploadForm families={families} />
        </div>
      </div>
    );
  return (
    <div className="rounded-panel border border-border bg-card p-6 shadow-surface sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-selected text-selected-foreground">
            <Upload size={22} strokeWidth={1.6} aria-hidden />
          </span>
          <div>
            <h3 className="m-0 text-lg font-semibold">Add a PDF when you need it</h3>
            <p className="m-0 mt-2 max-w-lg text-sm text-muted-foreground">
              Keep the library clear. The file and version fields open in a focused drawer.
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            dialog.current?.showModal();
            setOpen(true);
          }}
          aria-haspopup="dialog"
        >
          Try the upload drawer
        </Button>
      </div>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label="Upload a resume preview"
        className="ml-auto mr-0 mt-0 h-dvh max-h-none w-[min(32rem,100vw)] max-w-none border-l border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-6">
          <div>
            <h3 className="m-0 text-xl font-semibold">Upload a resume</h3>
            <p className="m-0 mt-2 text-xs text-muted-foreground">
              Try the form. No records are changed.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={close}
            aria-label="Close upload drawer"
          >
            <X size={20} aria-hidden />
          </Button>
        </header>
        <div className="p-6">{open && <UploadForm families={families} close={close} />}</div>
      </dialog>
    </div>
  );
}
