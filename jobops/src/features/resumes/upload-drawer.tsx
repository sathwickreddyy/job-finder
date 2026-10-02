"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { quickResumeUpload } from "@/features/candidate/hub-actions";
import { uploadVersion } from "./actions";

export function ResumeUploadDrawer({
  families,
  familyId,
  initialOpen = false,
  label = "Upload a resume",
}: {
  families: { id: string; name: string }[];
  familyId?: string;
  initialOpen?: boolean;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  useEffect(() => {
    if (initialOpen) {
      dialog.current?.showModal();
    }
  }, [initialOpen]);
  return (
    <>
      <Button
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <Upload size={16} aria-hidden />
        {label}
      </Button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label="Upload a resume"
        className="ml-auto mr-0 mt-0 h-dvh max-h-none w-[min(32rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-6">
          <div>
            <h2 className="m-0 text-xl font-semibold">Upload a resume</h2>
            <p className="m-0 mt-2 text-xs text-muted-foreground">
              Originals and revised PDFs are kept separately.
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
        <div className="p-6">
          {open && <UploadFields families={families} familyId={familyId} close={close} />}
        </div>
      </dialog>
    </>
  );
}

function UploadFields({
  families,
  familyId,
  close,
}: {
  families: { id: string; name: string }[];
  familyId?: string;
  close: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState(familyId ?? families[0]?.id ?? "new");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const isNew = target === "new";
  function choose(next?: File) {
    setError("");
    setFile(null);
    if (!next) return;
    if (!/\.pdf$/i.test(next.name) || (next.type && next.type !== "application/pdf"))
      setError("Choose a PDF file.");
    else if (!next.size || next.size > 10 * 1024 * 1024) setError("Choose a PDF up to 10 MiB.");
    else setFile(next);
  }
  return (
    <ActionForm action={isNew ? quickResumeUpload : uploadVersion} pendingLabel="Uploading resume">
      <div className="space-y-2">
        <label htmlFor={`${id}-target`} className="text-sm">
          Add this file to
        </label>
        <select
          id={`${id}-target`}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name} · new version
            </option>
          ))}
          <option value="new">A new resume</option>
        </select>
      </div>
      {!isNew && <input type="hidden" name="resumeId" value={target} />}
      <div
        className="rounded-2xl border border-dashed border-input bg-rail/40 p-5 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (input.current?.disabled) return;
          const next = event.dataTransfer.files[0];
          if (input.current) {
            const transfer = new DataTransfer();
            if (next) transfer.items.add(next);
            input.current.files = transfer.files;
          }
          choose(next);
        }}
      >
        {file ? (
          <FileText size={28} className="mx-auto text-primary" aria-hidden />
        ) : (
          <Upload size={28} className="mx-auto text-muted-foreground" aria-hidden />
        )}
        <p className="m-0 mt-3 break-all text-sm font-medium">
          {file?.name ?? "Drop your PDF here, or choose a file"}
        </p>
        <p className="m-0 my-3 text-xs text-muted-foreground">
          {file ? `${(file.size / 1024).toFixed(1)} KB · ready to upload` : "PDF up to 10 MiB"}
        </p>
        <label htmlFor={`${id}-file`} className="sr-only">
          PDF file
        </label>
        <input
          ref={input}
          id={`${id}-file`}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          onChange={(event) => choose(event.target.files?.[0])}
          className="!border-0 !bg-transparent !p-0 !text-xs file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-secondary-foreground"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-label`} className="text-sm">
          {isNew ? "Resume name" : "Version label"}
        </label>
        <input
          key={isNew ? "name" : "version"}
          id={`${id}-label`}
          name={isNew ? "name" : "versionLabel"}
          required
          maxLength={isNew ? 100 : 80}
          placeholder={isNew ? "My resume" : "Company, role or what changed"}
        />
      </div>
      {!isNew && (
        <details>
          <summary className="text-sm font-medium">Bullet changes and default setting</summary>
          <div className="mt-3 space-y-4">
            <label htmlFor={`${id}-notes`} className="block text-xs text-muted-foreground">
              Bullet changes with this upload
            </label>
            <textarea
              id={`${id}-notes`}
              name="changeNotes"
              rows={4}
              maxLength={20000}
              placeholder="Original wording, revised wording and confirmed facts"
            />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="makeCurrent" />
              Use this as my default file
            </label>
            <p className="m-0 text-xs text-muted-foreground">
              Existing applications keep the PDF you submitted.
            </p>
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-action">
          {error}
        </p>
      )}
      <div className="flex gap-3 border-t border-border pt-4">
        <Button disabled={!file || Boolean(error)}>{isNew ? "Upload resume" : "Upload PDF"}</Button>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}
